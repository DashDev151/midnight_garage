# Sprint 08 - Service jobs (the Act 1 floor)

*Source: the maintainer's agreed next focus, and canonical GDD scope - §2 Act 1 ("One-off service
jobs ARE the gameplay: an oil change on an '84 City, a clutch in a Sunny, shaken prep on a rusty
Mira") and §2's note that these are "hand-played job cards (pick the work, assign the slots, tight
margins)" that staff later absorb into the passive Service Bay (§3.4). economy-v0.md has the Act-1
job values. This is elaborating frozen scope, not new scope. Builds on the Sprint 06 job/labor
system and Sprint 07 persistence. Status: **implemented and locally verified - ready for review. Bays
deferred to the Facilities sprint (`docs/design/facilities-bays.md`).***

## Goal

Give the early game a floor. Right now a new player has only auctions - capital-hungry and swingy,
punishing when you're broke. **Service jobs** are guaranteed-profit work on customers' cars you never
own: a customer walks in ("brakes are shot on my Corolla"), you accept, and **their car physically
enters your shop**. You then do the actual work - the same work you do on your own cars: buy the
parts, assign labor to install or repair on that car - and when the job's requirement is genuinely
met you **hand it back** for a **tight but reliable margin**. It carries you until you can afford to
flip - and by design, flipping should out-earn grinding jobs by the midgame (the crossover the
balance harness can pin down). It's also the natural tutorial vehicle (Sprint ~25's landlord
onboarding teaches through these).

## Definition of Done

- A pool of **available service jobs** is generated from content templates and refreshes weekly.
- Accepting a job **brings the customer's car into the shop** as a real, workable `CarInstance` in
  `activeServiceJobs` - the player then works it exactly like an owned car (buy parts, queue
  repair/install jobs, assign labor across days).
- Resolution is **immediate and player-triggered**: clicking "Complete Job" resolves the job that
  instant (a store call to `resolveServiceJob`), **not on End Day**. If the required work is done
  (repair zone at 100, or the required-slot part installed) the fixed `payoutYen` + reputation land;
  if not, the job **fails** (no pay, and a reputation penalty). Either way the car leaves - it is
  **never owned**.
- **Every accepted job has a deadline** (`dueOnDay`, `SERVICE_JOB_DEADLINE_DAYS` after acceptance).
  If the player never hands it back in time, `advanceDay`'s deadline backstop auto-resolves it via
  the same `resolveServiceJob` - paid if the work happens to be done, failed (penalty) if not.
- Concurrent service work is **not** bay-limited this sprint (bays are the Facilities sprint) -
  labor is the only throttle.
- Payouts and acceptances show up in the **end-of-day report**; a **Jobs screen** lists available
  work and the cars in the shop (linking to each car to work on it).
- All checks green; new content/sim/game tests pass. Golden master unchanged (the service step is
  inert when no service jobs are in play).

## Decisions (approved with refinements 2026-07-09; corrected same day)

1. **A `ServiceJob` carries the customer's real car (corrected 2026-07-09).** The first pass modelled
   a job as an abstract labor contract that auto-completed - wrong. The correct model: a job is
   `{ id, templateId, customerName, description, work, car: CarInstance, payoutYen, baseReputation,
   expiresOnDay }`, where `work` is a discriminated union - `{ kind: 'repair', zone }` or
   `{ kind: 'install', slot }`. Accepting moves the offer into `activeServiceJobs`; its `car` is now
   in the shop and worked through the **same job/labor/parts system as owned cars**. It's never in
   `ownedCars`, so it can't be sold - the car-detail screen hides Sell for it.
2. **The player does real work with the real parts economy - this is the point (maintainer).** A
   repair job means the player queues a `repair-zone` job on the customer's car and spends labor. An
   install job means the player **goes to the parts market, buys a part of the required slot** (budget
   or pricey - their choice), then queues an `install-part` job on the car - identical to building
   their own car. **The job always pays the same fixed `payoutYen`;** a pricier part just eats into
   profit. The trade-off is **profit vs. reputation**: a higher-grade installed part earns a higher
   reputation multiplier (lower profit); a cheap part earns more profit, less reputation. No part
   choice happens at acceptance - it's all done afterward, on the car.
3. **The player resolves the job immediately, and there's a deadline (corrected 2026-07-09).**
   Completion is **not** a DayAction and End Day does **not** decide a job is done. The player works
   the car and clicks **"Complete Job"**, which resolves that instant via a store call to the pure
   `resolveServiceJob` - work done → pay + reputation; work not done → **fail** (no pay, reputation
   penalty). Every accepted job carries a `dueOnDay` (`SERVICE_JOB_DEADLINE_DAYS` after acceptance);
   `advanceDay`'s only involvement is a **deadline backstop** that runs the *same* `resolveServiceJob`
   on any overdue job. One resolution path, two triggers (the click and the deadline) - no
   duplicated completion logic.
4. **Reputation is scaffolded here (not fully built).** GameState gains `reputationPoints` (persisted,
   accrued on completion; install jobs multiply the gain by the installed part's grade). This is the
   seam the full reputation system (tiers, gating, buyer behavior, repeat customers) plugs into later.
5. **Reuse the existing labor/job system wholesale.** No separate service-labor path: service work is
   ordinary `repair-zone` / `install-part` jobs whose `carInstanceId` happens to point at a car in
   `activeServiceJobs`. `completeJob` applies a finished job to a car found in **either** `ownedCars`
   **or** `activeServiceJobs[].car`. When a service job is handed back, any leftover jobs on its
   departed car are dropped.
6. **NO bay caps in Sprint 08 (maintainer, 2026-07-09).** Concurrency is thrown wide - labor is the
   only throttle. The **bays system is its own sprint, directly after this one**, fully specified in
   `docs/design/facilities-bays.md`.
7. **Job templates live in content JSON** (content law): `packages/content/data/serviceJobs.json`
   (brake/suspension/engine/body/interior repairs + coilover/brake/wheel installs), Zod-validated. A
   generator offers a few on the weekly cadence (reusing the day-7 boundary), each rolling a real
   customer car via `generateAuctionCarInstance`, with expiry like auction lots.
8. **A dedicated `/jobs` screen** - accept-only job board (customer, car, required work, payout, base
   rep) plus an **"In the shop"** list of accepted jobs with their work state, each linking to the
   car's page where the actual work + the "Complete Job" button live.
9. **No skill/XP here.** Service jobs are the *future* home of player-skill XP
   (`docs/design/skill-progression.md`), Sprint 13 scope.

**Labor ↔ bays ↔ staff (the loop to model, per the maintainer):** bays = how many cars you can work
on at once; labor = how much wrenching per day; staff = more labor. Sprint 08 ships the labor half;
the bays half is the Facilities sprint. Fully documented in `docs/design/facilities-bays.md`.

## Task breakdown

### A. Content (`packages/content`)

- [x] `src/serviceJob.ts`: `ServiceJobWorkSchema` (discriminated union of `repair`/zone and `install`/slot),
  `ServiceJobTemplateSchema` (id, customerName, description, `work`, `payoutYen`, `baseReputation`),
  and `ServiceJobSchema` (a live job: template fields + `templateId` + `car: CarInstance` +
  `expiresOnDay`).
- [x] `data/serviceJobs.json`: 8 Act-1 templates (5 repair, 3 install) from economy-v0's values;
  exported as `SERVICE_JOB_TEMPLATES` via `data.ts`.
- [x] Extend `GameStateSchema`: `serviceJobOffers` + `activeServiceJobs` (both default `[]`),
  `reputationPoints` (default 0). Add `service-job-accepted` (jobId, carInstanceId) and
  `service-job-completed` (jobId, payoutYen, reputationGained) `DayLogEntry`s. Save-schema change →
  `SAVE_VERSION` bumped, default-filling migration, golden-save test.

### B. Sim (`packages/sim`)

- [x] `src/serviceJobs.ts`: `generateServiceJobOffers(templates, models, hiddenIssuesByZone, day,
  count, expiresInDays, rng)` (each offer rolls a real customer car), `isServiceWorkDone(job)`, and
  `reputationForCompletion(baseReputation, grade)`.
- [x] `actions.ts`: `acceptServiceJobs: [{ offerId }]` (no part choice at acceptance). Completion is
  **not** a DayAction - the player resolves immediately. Work uses the existing `createJobs` /
  `laborAssignments`.
- [x] `serviceJobs.ts`: `resolveServiceJob(state, jobId, context)` - the single resolution path
  (done → pay + grade-scaled reputation; not-done → fail + `reputationForFailure` penalty; car
  leaves; leftover jobs dropped), shared by the store click and the deadline backstop.
- [x] `jobs.ts`: `completeJob` applies a finished job to a car in `ownedCars` **or**
  `activeServiceJobs[].car` (shared `applyJobToCar` core).
- [x] `advanceDay.ts`: accept moves offer→active and stamps `dueOnDay`; work flows through the single
  job path; a **deadline backstop** resolves any overdue job via `resolveServiceJob`; expire stale
  offers; refresh weekly.
- [x] `constants.ts`: service-offer count/expiry, the deadline window, the grade→reputation and
  failure-penalty multipliers, and the `repairLaborSlotsFor` / `INSTALL_LABOR_SLOTS` labor-cost
  helpers (moved here from the game layer so both the store and the bot share one source; the game
  re-exports them).
- [x] A **Service Grinder bot** that accepts repair jobs, queues repair jobs on the customer cars,
  feeds them labor, and lets the deadline hand them back - the player-hands Act-1 floor for the harness.

### C. Game (`packages/game`)

- [x] Store: `serviceJobOfferViews` / `activeServiceJobViews` (car names, work state, deadline
  `daysLeft`, failure penalty); `reputationPoints` getter; `queueAcceptServiceJob(offerId)` and an
  **immediate** `completeServiceJob(jobId)` (calls `resolveServiceJob`, returns the outcome for UI
  feedback); `carDetail` + the repair/install/installable helpers resolve a car in `ownedCars` **or**
  an active service job; `planActions` has no separate service path.
- [x] `ServiceJobsScreen.vue` at `/jobs`: accept-only job board + an "In the shop" list (deadline
  countdown, work state) linking to each car. The actual work + resolution happen on
  `CarDetailScreen.vue`, which shows a **customer-job banner** (required work, payout, deadline, live
  status) and a **"Complete Job" / "Give Up Job"** button that resolves immediately (green pay vs.
  danger forfeit), and hides Sell for customer cars.
- [x] `describeLogEntry` gains `service-job-accepted`, `service-job-completed`, `service-job-failed`;
  deadline resolutions surface in the `DayReport`; `reputationPoints` shows in the garage summary.

### D. Testing

- [x] Content: schema + round-trip for `ServiceJob` (with car + work union), `reputationPoints`, the
  new log entries; `serviceJobs.json` validates. Save law: `SAVE_VERSION` bumped; pinned v1 golden
  code still decodes (default-fill migration).
- [x] Sim: `resolveServiceJob` pays + grants reputation when done (car leaves, leftover jobs dropped),
  fails with a clamped reputation penalty and no pay when not done, and is a no-op for an unknown id;
  a pricier installed grade earns more reputation; accepting stamps `dueOnDay`; the deadline backstop
  pays finished / fails unfinished overdue jobs; stale offers expire; golden masters unchanged.
- [x] Store (outcome-asserting): accept → work the car → immediate Complete → cash + reputation rise,
  job clears, no car owned; Complete before the work is done fails immediately (no pay); an untouched
  job auto-fails at its deadline.
- [x] Component: the Jobs screen renders offers and Accept queues them.

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D (content + sim + game + a harness bot). No new dependencies.

**User-only:** run `pnpm dev`, take a service job, work the customer's car (buy a part, assign labor,
Complete Job), confirm the payout carries you while broke; then feel whether flipping starts to tempt
you over grinding (the intended pull into Act 2). Optionally re-run the balance harness
(`pnpm balance:run` then `python -m balance.cli check`) - the Service Grinder's behavior changed with
this corrected model, so its numbers want a fresh look.

## Implementation notes & verification

- **The service-job model was rebuilt mid-sprint (2026-07-09).** The first pass made jobs abstract
  contracts that auto-completed with generic labor - it did not put a real car in the shop and did
  not make the player do the work. The maintainer flagged this as fundamentally wrong; the corrected
  model above (real car in shop, real work via the existing job system, player-triggered hand-back)
  replaces it end-to-end.
- **No bays this sprint** (decision 6) - concurrency is wide open; labor is the only throttle.
- **The economy crossover (jobs → flipping) is asserted by the harness, not hand-tuned here.**
- **Verification:** `pnpm typecheck / lint / format / build` green; **195 tests across 41 files**.
  Save `SAVE_VERSION` bumped (additive, v1 saves still load); sim golden masters unchanged (the
  service step is inert when no service jobs are in play).

## Exit

Service jobs give Act 1 a floor and the tutorial its lessons, on a game that now persists (Sprint
07). After this, the roadmap's **Fun Gate** (five strangers, 30+ minutes) is the next milestone -
and it's a fair test only now that a broke new player has a way to earn, a reason to flip, and a save
that survives the night. The restoration-reward and buyout-premium questions from the external review
ride into that gate's interviews and its tuning pass.
