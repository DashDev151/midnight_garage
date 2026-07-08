# Sprint 02 — The Day Tick

*Source: roadmap Phase 1, Sprint 2. GDD sections 3.1-3.2 (turn structure, labor slots), 3.4 (service
bay), 4.2 (derived stats), 6.2 (money out), 6.4 (market heat). Status: **implemented — ready for
review.***

## Goal

`advanceDay(state, queuedActions, seed)` — the sim's actual heartbeat. Everything upstream
(Sprint 1's schemas) was inert data; this sprint makes a day actually pass: labor gets spent,
jobs progress and complete, rent and wages come due, market heat drifts, and a car's five derived
stats become a computable (not stored) fact. All of it deterministic and headless.

## Definition of Done (from roadmap)

A scripted 30-day career runs headless and reproducibly: same seed, same script, same final
state hash, every time.

## Design decisions (made at design time, flag disagreement in review)

1. **Derived stats are computed, not stored.** `CarInstance` (Sprint 1) deliberately has no
   Power/Handling/Style/Reliability/Authenticity fields — GDD 4.2 says they're derived from
   platform + parts + condition + tune, so `computeDerivedStats(model, instance)` is a pure query
   function in `packages/sim`, called on demand (by tests now, by the UI later), never written
   into `GameState`. One source of truth, no staleness risk.
2. **First-pass formulas, explicitly tunable.** The stat formulas, service-bay income, and the
   weekly rent constant are v1 numbers seeded from `docs/economy-v0.md` and the GDD, marked in
   code comments as subject to the Sprint 3 balance harness. Getting the *shape* right (what
   inputs feed each stat) matters more than the exact coefficients this sprint.
3. **`GameState` gains two fields:** `jobs: Job[]` (in-progress labor, GDD 4.1 "build sheet" /
   §11 "job queue") and `marketHeat: Record<modelId, number>` (demand index, base 100, GDD 6.4).
   Both defined in `packages/content` (extending Sprint 1's schema — additive, pre-1.0, no
   migration concern yet) since `GameState` is content's type, not sim's.
4. **Two job kinds only:** `repair-zone` (restores a condition zone to 100 on completion) and
   `install-part` (moves a `PartInstance` already in `partInventory` into a `buildSheet` slot on
   completion). This covers every GDD 3.2 example (inspect, coilover swap, engine rebuild,
   restoration) as varying `laborSlotsRequired` on the same two kinds — no need for a bigger job
   taxonomy yet. Installing into an already-occupied slot is treated as an error (logged, job
   skipped), not a silent part swap — the player decides what to do with the old part later
   (uninstall-as-a-job is a natural Sprint 4/5 addition, out of scope now).
5. **No passive condition decay.** The GDD doesn't describe cars degrading on their own over
   time — only jobs change condition. Not inventing a mechanic the design docs don't specify.
6. **Per-day seed is caller-derived**, not read from `state.seed` directly: the caller (test
   script now, the game loop later) passes `state.seed + state.day` (or any deterministic
   variant) as `advanceDay`'s third argument, so every day gets a distinct but fully reproducible
   RNG stream. Matches the roadmap's literal `advanceDay(state, queuedActions, seed)` contract.
7. **Equipment/Act-tier gating on job availability is out of scope.** GDD 9.0's tool-gated job
   tiers (lift, dyno, crane...) are a Sprint 14 system; Sprint 2 lets any job run if labor slots
   allow, matching where the roadmap actually introduces equipment.
8. **Implementation-time addition: `job-blocked` log event.** Group C's own test plan calls for
   an occupied-slot install to "log an error" — the Sprint-design-time `DayLogEntrySchema` had no
   event for that, so `{ type: 'job-blocked', jobId, reason: 'slot-occupied' }` was added
   alongside `job-created`/`job-completed`. A blocked job stays open (not silently dropped or
   force-completed) so the player can resolve it later — uninstalling the occupying part is a
   natural Sprint 4/5 job kind, not built here.
9. **Implementation-time addition: `computeDerivedStats` takes a `partsById` catalog lookup.**
   `PartInstance` (Sprint 1) intentionally only carries `partId` + condition + genuine-period —
   the actual `statModifiers` live on the `Part` catalog entry. Resolving them requires a
   `Record<string, Part>` lookup, which the sim has no data-loader to build itself, so it's a
   third parameter the caller supplies (from `data/parts.json` in the game, a small fixture in
   tests). Kept out of the design doc's original signature by oversight, not a scope change.

## Task breakdown

### A. Content schema additions (`packages/content`)

- [x] `src/job.ts`: `JobSchema` — id, carInstanceId, kind (`repair-zone` | `install-part`), zone
  (repair-zone only), slot + partInstanceId (install-part only), `laborSlotsRequired`,
  `laborSlotsSpent`. Three refinements: repair-zone requires a zone, install-part requires both
  slot and partInstanceId, and spent never exceeds required.
- [x] Extended `GameStateSchema`: `jobs: Job[]` (default `[]`), `marketHeat: z.record(z.string(),
  z.number())` (default `{}`).
- [x] Extended `DayLogEntrySchema`: `job-created`, `job-completed`, `job-blocked` (see design
  decision 8), `labor-overbooked`. **`job-progress`'s shape changed** from the Sprint 1
  placeholder (`carInstanceId`+`slot`) to `jobId`+`laborSlotsSpent` — the old shape didn't fit
  once real jobs existed. Sprint 1's `gameState.test.ts` fixture was updated to match, and now
  covers all 8 event types instead of the original 5.

### B. Sim: the day tick (`packages/sim/src`)

- [x] `constants.ts`: `PLAYER_BASE_LABOR_SLOTS = 2`, `STAFF_HUSTLE_BONUS_THRESHOLD = 4`,
  `WEEKLY_RENT_YEN = 90_000`, `REPUTATION_INCOME_MULTIPLIER`, `SERVICE_BAY_YEN_PER_HUSTLE`,
  `MARKET_HEAT_WEEKLY_DRIFT_RANGE`.
- [x] `laborSlots.ts`: `availableLaborSlots(state)`.
- [x] `derivedStats.ts`: `computeDerivedStats(model, instance, partsById)` — see design decision 9
  for the added third parameter. All five stats clamped to sane bounds (power >= 0; the other
  four to [0, 100]).
- [x] `jobs.ts`: `createJob(spec, id)`, `applyLaborToJob(job, slots)`, `isJobComplete(job)`,
  `completeJob(state, job)` — returns `{ state, blockedByOccupiedSlot }` rather than throwing on
  a slot conflict, so the caller can log and leave the job open.
- [x] `serviceBay.ts`: `computeServiceBayIncomeYen(staff, reputationTier)`.
- [x] `finances.ts`: `applyWeeklyRentAndWages(state)`.
- [x] `marketHeat.ts`: `driftMarketHeat(state, rng)`.
- [x] `advanceDay.ts`: orchestrates all of the above in the designed order; returns
  `{ state: GameState; log: DayLog }`.
- [x] `actions.ts`: `DayActionsSchema` (`createJobs`, `laborAssignments`), in sim as designed.
  `sim`'s `package.json` gained `zod` as a **direct** dependency (not just transitively via
  content) since `actions.ts` imports it itself — required for `tsc` to resolve module types.
- [x] `hashState.ts`: FNV-1a over a canonical (key-sorted) JSON serialization — no new dependency.

### C. Golden-master test (`packages/sim/tests/advanceDay.test.ts`)

- [x] Fixed initial `GameState` exactly as designed.
- [x] Scripted 30-day career exactly as designed (day 1-2 repair-zone job, day 3 install-part job,
  days 4-30 idle).
- [x] Hash pinned to `0349eea8`, captured from a real run (not guessed) — confirmed correct by
  running once, reading the assertion failure's actual value, and pinning that.
- [x] Determinism check: two independent 30-day runs from the same seed produce identical hashes.
- [x] **Verified the golden master actually catches breakage**, same discipline as Sprints 00/01:
  temporarily swapped `marketHeat.ts`'s seeded `rng.int()` call for one gated behind
  `Math.random()`, reran — both the pinned-hash test and the determinism test failed as expected,
  then reverted and confirmed all tests green again.
- [x] Unit tests per module (`packages/sim/tests/`): `derivedStats.test.ts` (5 tests — baseline,
  genuine-part modifier, worn-part scaling, power floor, non-genuine authenticity penalty),
  `jobs.test.ts` (5 — creation, labor clamping, both completion paths, occupied-slot block),
  `laborSlots.test.ts`, `serviceBay.test.ts`, `finances.test.ts`, `marketHeat.test.ts`,
  `actions.test.ts` (3 each).

## Testing

- [x] Golden-master 30-day career: exact hash match + repeat-run determinism + a live check that
  the test fails when it should.
- [x] Per-module unit tests for every file in group B (38 sim tests total, including the 5
  pre-existing RNG tests).
- [x] Schema validation: `Job` (new `tests/job.test.ts`, 5 tests) and the extended
  `GameState`/`DayLogEntry` shapes (updated `tests/gameState.test.ts`) parse correctly.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (60 tests, 15 files), `pnpm build`
  all green.

## Hygiene and docs

- [x] CLAUDE.md's current-state note updated.
- [x] Two implementation-time additions flagged above (design decisions 8-9) — neither was silent
  drift; both were gaps the design doc left implicit that implementation made concrete.

## Exit

DoD met: golden-master 30-day career reproducible from seed 42, verified to actually catch
non-determinism when it's introduced. Committed as `97af527` and pushed to `main`. **Sprint 02
complete.** Sprint 03 (markets, auctions, balance harness) is the first sprint that can actually
answer "what does day 40 look like for a flipper?" — it depends on this sprint's `advanceDay`
existing and being trustworthy.
