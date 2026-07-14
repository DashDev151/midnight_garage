# Sprint 57 - Jobs close where they open: completion on the jobs screen, and an honest post-job report

**Source:** playtest 2026-07-14 item 7 (`docs/playtest-notes-2026-07-14.md`): accept and
complete jobs from the same place, and give each finished job a real report - what was done,
what it cost the player, what it paid, what reputation was gained, and the net profit.

## Confirmed current state (code discovery, 2026-07-14)

- Offers are accepted on `ServiceJobsScreen.vue` (job board + "In the shop" active list), but
  the Complete/Give-Up button lives on `CarDetailScreen.vue`'s service banner (lines 477-521),
  calling `game.completeServiceJob` -> sim `resolveServiceJob` (`serviceJobs.ts:893-976`). The
  active list already links "work on car ->" to the car screen; nothing links back.
- A post-job modal ALREADY EXISTS: `JobCompleteModal.vue`, globally mounted in `App.vue`,
  driven by `game.lastJobResult`. It shows outcome, task list, payout, part cost, profit,
  reputation delta, and days on job. Two of its numbers are dishonest or missing:
  - **Repair spend on a customer car is tracked nowhere.** `jobs.ts:433-447` explicitly ledgers
    repair charges only for OWNED cars (Sprint 42's flip ledger is owned-car-only by design;
    `CarDetailScreen.test.ts:416` pins that). The player fronts customer-car repair yen out of
    cash and it is never attributed to the job.
  - **Part cost is reconstructed from catalog list price** (`installedTaskParts`,
    `serviceJobs.ts:807-816`) rather than what was actually paid (`PartInstance.pricePaidYen`
    exists since Sprint 42), and only for install tasks - repair-only jobs report no cost or
    profit at all.
  - **Specialty gain is applied silently** (`applySpecialtyDelta`, split across the job's task
    groups) - not in the log entry, not in the result view.
- `service-job-completed` DayLogEntry carries `{ jobId, payoutYen, reputationGained,
  partCostYen?, profitYen?, daysSpent? }` - additive room for the missing fields.
- Completion preconditions: car must have arrived (in-transit guard); tasks NOT required done -
  early completion fails the job (the "Give Up" framing). Bay occupancy gates work, not
  completion.

## Reuse analysis (directive 16)

**New mechanisms:**

- A per-job spend ledger: `GameState.serviceJobLedgers` keyed by job id, `{ repairYen,
  partsYen }` - the Sprint 42 `CarLedger` shape reused at job scope. (This is the exact gap
  Sprint 42 deliberately left; it is now needed.)

**Existing mechanisms to reuse:**

- `JobCompleteModal` is the post-job screen - it gets enriched, not replaced, and it is already
  globally mounted so it works no matter which screen triggers completion.
- The ledger write pattern and call sites: the same `chargeRepairWork` gate and
  install-completion resolver that already call `updateCarLedger` for owned cars gain the
  job-ledger branch for service cars (`jobs.ts` service branch, currently a no-op for costs).
- `PartInstance.pricePaidYen` (Sprint 42) replaces the catalog-price reconstruction.
- `resolveServiceJob` already computes reputation and specialty deltas at close-out - they just
  need threading into the result/log instead of being applied silently.
- The Complete/Give-Up button's exact semantics (workDone-dependent label, early completion =
  failure) move as-is; `resolveServiceJob` needs no behavioral change.
- Dexie bump + golden-save pattern for the new state field.

## Decisions

1. **Completion moves to the jobs screen.** Each "In the shop" row gains the Complete
   Job / Give Up Job button (same workDone-dependent label and store action as today);
   `CarDetailScreen`'s service banner keeps the status text, due date, and in-transit state but
   loses the button - one place to accept, one and the same place to complete. The "work on
   car ->" link stays as the bridge to the wrench work.
2. **The job ledger.** `serviceJobLedgers[jobId] = { repairYen, partsYen }`, written at the two
   existing charge sites (customer-car repair charges; install completion at
   `pricePaidYen`), reconciled out (deleted) at job close alongside the Sprint 35 customer-part
   reconciliation. Dexie bump (next free version) + golden-save test.
3. **An honest report.** `resolveServiceJob` returns (and `service-job-completed`/`-failed` log
   entries carry, additively): `repairCostYen`, `partsCostYen` (actual paid), `specialtyGained`
   (per-group split), and `netProfitYen = payoutYen - repairCostYen - partsCostYen`.
   `JobCompleteModal` renders: task list (kept), payout, the two cost lines, net profit colored
   by sign (the Sprint 42 Finances-panel convention), reputation and specialty gains, days on
   job. Failed jobs show the same cost lines as sunk cost - honesty cuts both ways.
4. **No new screen.** Item 7 says "post job screen"; the enriched modal fulfills it (it already
   interrupts at the right moment, on any screen). If the maintainer wants a persistent job
   history later, that is a new feature for the roadmap, not this sprint.

## Tasks

**Claude:**

1. Content: `serviceJobLedgers` state field + schema; additive log-entry fields; content tests.
2. Sim: ledger writes at the two charge sites; close-out threading of costs/specialty into the
   result and log entries; reconciliation on close; tests (repair-only job reports costs;
   install job reports paid-not-catalog prices; failed job reports sunk costs; ledger cleaned
   up on close).
3. Game: button move (`ServiceJobsScreen` rows + `CarDetailScreen` banner slimming), modal
   enrichment, `dayLogFormat` updates for the new fields; component tests (complete from the
   jobs screen end-to-end; modal shows net profit; banner no longer offers completion).
4. Save: Dexie bump + golden-save test.
5. Full gate; balance harness NOT required (bookkeeping + UI relocation, zero economic change -
   same argument as Sprint 42, which proved its ledger neutral); state that in the Exit, and if
   any sim output hash moves, treat it as a bug.

**User-only (maintainer):**

- None beyond normal review; flag if the Give Up flow deserves its own confirmation step while
  the button is being moved (currently one click fails the job with a reputation hit).

## Definition of done

- A job is accepted and completed on the same screen; the car screen never offers completion.
- Completing any job (including repair-only) pops a report with what was done, actual costs,
  payout, reputation and specialty gained, and a signed net profit.
- The reported costs are what the player actually paid, not catalog reconstructions.
- Dexie migration + golden save green; full gate green; zero economic drift.

## Exit

Implemented and committed.

**The job ledger (decision 2).** `serviceJobLedgers: Record<jobId, {repairYen, partsYen}>` on
`GameState` (new `packages/sim/src/serviceJobLedger.ts`, mirroring `carLedger.ts`'s exact
get/update/delete shape). Written at the two named charge sites: `repairJobGate`'s customer-car
branch (was a no-op before this sprint) now writes to the job's ledger instead of nowhere;
`completeJob`'s service-car `install-part` branch now writes `pricePaidYen` to the job's ledger,
mirroring the owned-car branch's `carLedgers` write exactly. Read once and deleted at close-out in
`resolveServiceJob`, alongside the existing Sprint 35 customer-part reconciliation.

**The honest report (decision 3).** `service-job-completed`/`service-job-failed` log entries
dropped the old install-only, catalog-price-reconstructed `partCostYen`/`profitYen` fields for four
new ones present on both outcomes: `repairCostYen`, `partsCostYen` (both read straight off the
job's ledger - real spend, never a catalog reconstruction), `specialtyGained` (a full per-group
record, `applySpecialtyDelta` now returns its own deltas instead of just the mutated state), and
`netProfitYen` (`payoutYen - repairCostYen - partsCostYen`, negative-only on a failure - sunk cost,
shown honestly). `JobCompleteModal.vue` renders all of it: repair/parts cost lines (hidden when
zero), a signed Net Profit/Sunk Cost line, and a Specialty line naming each touched group with its
real display name.

**Completion moves to the jobs screen (decision 1).** Each "In the shop" row on
`ServiceJobsScreen.vue` gained the exact same workDone-dependent Complete/Give Up button
`CarDetailScreen.vue`'s service banner used to own (same `game.completeServiceJob` call, same
label/danger-styling logic) - `ServiceJobView` already carried everything the button needed
(`workDone`, `failureReputationPenalty`), so no new gameStore fields were required. The car
screen's banner keeps its status text, due date, and in-transit state, with copy pointing to the
job board for the actual action; the dead `onCompleteJob` handler and its now-unused
`button.primary.danger` CSS were removed.

**Save.** `SAVE_VERSION` 28 -> 29, the normal additive case (no `MIGRATIONS` entry needed, schema
default `{}` handles it) - two new golden-save tests (a pre-v29 save decodes with every ledger
empty; a v29 state with a real per-job ledger round-trips exactly), plus the file's existing
"SAVE_VERSION is N" canary assertions bumped to 29 across all 7 spots that track it.

**Testing.** Sim: rewrote the two stale `jobs.test.ts` tests that asserted "a customer-car charge
creates no ledger entry at all" (true before this sprint, now testing the WRONG behavior per
CLAUDE.md directive 17 - they now assert the job ledger gets the entry instead); rewrote the two
`serviceJobs.test.ts` install-cost tests to inject a ledger value deliberately different from the
catalog price, proving the report reads real spend, not a reconstruction; added dedicated
repair-only, failed-job-sunk-cost, and ledger-cleaned-up-on-close tests. Every sim test file that
hand-builds a raw `GameState` literal (16 files) needed `serviceJobLedgers: {}` added to its base
fixture - a mechanical but real fallout of adding a required schema field with no default applied
outside `GameStateSchema.parse()`. Game: new `JobCompleteModal.test.ts` (paid job shows real costs
and a signed net profit; failed job shows sunk cost; zero-spend jobs hide the cost lines
entirely), a new `ServiceJobsScreen.test.ts` end-to-end completion test, a new
`CarDetailScreen.test.ts` test confirming the banner no longer renders the button, and a
strengthened assertion in the existing `gameStore.jobs.test.ts` full-repair-loop test proving the
ledger threads through a real (not hand-fabricated) charge end to end. Two golden-master hashes
re-pinned with documented justifications (`GameState` gained a real field); both scripted careers'
every other assertion still passes unchanged.

**Verification.** Full gate green: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`,
`pnpm test:coverage` (1029 tests, 79 files; coverage 91.36%/82.22%/92.18%/95.24%, all above the
ratchet floor), `pnpm build`. No balance harness run - this sprint is bookkeeping (the ledger
records money that was already being charged/spent through existing resolvers) plus a UI
relocation, zero economic change, the same argument Sprint 42 (the car flip ledger) proved for its
own identical shape; both re-pinned golden hashes are pure state-shape additions (a new empty
`{}` field), not value-model changes, and every other scripted-career assertion in the same tests
still passes.

**Definition of done, checked against the sprint doc:**
- A job is accepted and completed on the same screen; the car screen never offers completion - yes.
- Completing any job (including repair-only) pops a report with what was done, actual costs,
  payout, reputation and specialty gained, and a signed net profit - yes.
- The reported costs are what the player actually paid, not catalog reconstructions - yes, proven
  by the two rewritten `serviceJobs.test.ts` tests using a deliberately-mismatched ledger value.
- Dexie migration + golden save green; full gate green; zero economic drift - yes.
