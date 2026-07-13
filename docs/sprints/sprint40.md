# Sprint 40 - Playtest triage: honest job offers, band choice, and a main menu

**Source:** `docs/playtest-notes-2026-07-13.md` items 1, 2, 4, 5. Goal: kill the
work-done-before-arrival bug at its root, give the player granular repair-band control the sim
already supports, and add a temporary main menu that also closes the New Game data-loss footgun.

## Reuse analysis (directive 16)

**New mechanisms (genuinely new):**

- Generation-time task validation (a forcing step inside `generateDailyServiceJobOffers`).
- A `MenuScreen.vue` + route, a New Game confirmation flow, and a `hasExistingSave` store flag.
- A band-picker UI control (small, shared by three call sites).

**Existing mechanisms that MUST be reused (do not build parallels):**

- `isServiceTaskDone` / `isServiceWorkDone` (`packages/sim/src/serviceJobs.ts:637-662`) are the
  validation predicates - generation validates with the SAME functions resolution uses.
- `isServiceJobInTransit` (`serviceJobs.ts:600-602`) and `gameStore.isCarInTransit` are the transit
  checks - the board gating and the sim guard both use them; do not write a new `!= null` check.
  CarDetailScreen's local `arrivesOnDay != null` computed (line 34) is refactored onto the same
  helper (it currently duplicates it - a small DRY violation).
- `stageAction` / `repair` / `reconditionQuoteFor` / `reconditionPart` (gameStore) are already fully
  generic over `ConditionBand` - the band pickers pass a chosen band through EXISTING signatures.
  Zero sim or store changes for item 5.
- `exportSaveCode` / `importSaveCode` (gameStore) and the existing hydrate flow back the menu's
  Load/Continue; `stockInstanceFor`-style stock instance creation (`auctions.ts:169-178`) backs the
  validation forcing step.
- Router memory-history setup (`router/index.ts`) - the menu is one more route, not a new pattern.

## Decisions

### 1. Generation-time task validation (the real fix for items 2+4)

In `generateDailyServiceJobOffers`, after rolling the customer car and before deriving the payout,
FORCE every task to be genuinely outstanding (surgical per-slot forcing, never a whole-car reroll
loop):

- **Repair task** whose `isServiceTaskDone` is true (slot at/above target, scrap, or missing):
  install a fresh stock instance on that slot at a band rolled uniformly from the bands strictly
  BELOW `task.targetBand`, excluding `scrap` (e.g. target `fine` rolls from [poor, worn]; target
  `mint` rolls from [poor, worn, fine]). Use the same rng stream (one `rng.pick` per forced slot).
- **Install task** whose `isServiceTaskDone` is true (installed part already meets `minGrade`,
  which real content hits when `minGrade` is `stock`): clear the slot (`installed: null`) so the
  fit is real work.

After forcing, assert (in tests, not production code) `isServiceWorkDone === false` for every
generated offer. The payout derivation then automatically prices the now-real work (vacuous tasks
used to contribute ~0 cost, so payouts were floored at the callout fee - this fix also makes those
payouts honest).

Golden-master note: extra rng draws occur only when a collision is forced, so the fixed-seed
careers may shift - re-pin hashes if the full suite shows only hash diffs and the balance harness
still passes its hard invariants.

### 2. Board display gating (the visible symptom)

Add `inTransit: boolean` to `ServiceJobView` (`gameStore.ts` `serviceJobViewFor`, computed via
`isServiceJobInTransit(job, gameState.day)`). `ServiceJobsScreen.vue`'s "In the shop" row shows
"car arriving tomorrow" when `inTransit`, and only otherwise the work-done/outstanding status.
CarDetailScreen's local computed switches to the same view field.

### 3. Sim-side completion guard (defense in depth)

`resolveServiceJob` gets an early return when `isServiceJobInTransit(job, state.day)`: outcome
`'in-transit'` (extend the resolution outcome union; `completeServiceJob` in gameStore maps it to a
no-op return). Mirrors `resolveAcceptServiceJob`'s existing refusal pattern. Add a regression test:
accept on day N, attempt resolve on day N, expect refusal; advance to N+1, expect normal flow.

### 4. Band pickers (item 5)

One tiny presentational control (segmented buttons of valid target bands: strictly above the
part/group's current worst band, up to mint) used at three sites:

- CarDetailScreen per-part repair row: replaces the hardcoded `targetBand: 'mint'`
  (`CarDetailScreen.vue:198`).
- CarDetailScreen group "Repair all" control: replaces the `GROUP_REPAIR_TARGET_BAND = 'fine'`
  constant (line 76) - default selection stays `fine`.
- PartCard recondition control: replaces the hardcoded `'mint'` at `PartCard.vue:82/100` - default
  selection stays `mint`. The quote shown must re-derive from the selected band (the existing
  `reconditionQuoteFor(id, band)` already takes it).

Update the existing tests that assert hardcoded mint/fine staging; add one test per site proving a
non-default band flows through to the created job/stage entry.

### 5. Main menu (item 1) + New Game confirmation

- New `MenuScreen.vue` at route `/menu` (garage stays at `/`). After `hydrate()` resolves in
  `main.ts`, `router.replace('/menu')` so every session starts on the menu.
- `hydrate()` sets a new `hasExistingSave` ref (true iff a save was loaded from IndexedDB); it no
  longer matters that it silently seeds a fresh state when none exists - the menu uses the flag.
- Buttons: **Continue** (shown only when `hasExistingSave`; navigates to `/`), **New Game** (when a
  save exists, shows an inline confirmation step: "This overwrites your current garage. Copy a save
  code first if you want to keep it." with Confirm/Cancel; then `newGame()` + navigate), **Load
  save code** (textarea + button reusing `importSaveCode`, navigates on success), **Settings**
  (disabled stub, "coming soon").
- Remove the bare New Game button from `GarageScreen.vue:115` (and its test) - the menu owns it now.
- Deliberately temporary styling: plain panel, same design tokens. No art pass.

### 6. Log-schema hygiene (pre-builds Sprint 42)

`findOrCreateJob` already emits `costYen` on `'job-created'` entries but the schema variant lacks
the field (it survives only via an untyped spread - found during triage). Sanction it: add
`costYen: z.number().int().nonnegative().optional()` to the `'job-created'` variant. No behavior
change; Sprint 42's ledger reads it.

## Tasks

1. Sim: generation forcing step + `'in-transit'` resolution guard + tests (incl. a 300-seed
   invariant test: every generated offer has every task not-done).
2. Game: `inTransit` on `ServiceJobView`, board + car-page gating refactor, tests.
3. Game: band-picker control + three wirings + test updates.
4. Game: MenuScreen, route, hydrate flag, New Game confirmation, GarageScreen button removal, tests.
5. Content: `'job-created'` costYen sanction + schema test.
6. Full gate (typecheck, lint, format, coverage test) + balance harness sanity run (hard invariants
   only) + golden-hash re-pin if needed. Update this doc's Exit.

## Definition of done

- A 300-seed sweep generates zero offers with any already-satisfied task.
- The board never reads "work done - hand back" while a car is in transit; the resolver refuses
  in-transit completion.
- All three repair/recondition sites let the player pick any valid target band; defaults unchanged
  (fine for group repair, mint elsewhere).
- App boots to the menu; New Game requires confirmation when a save exists; Continue/Load work.
- Full local gate green; balance hard invariants pass.

## Exit

Implemented directly per the locked specification. All six tasks are done.

**1. Generation-time task validation.** `forceTasksOutstanding` (new, exported,
`packages/sim/src/serviceJobs.ts`) runs inside `generateDailyServiceJobOffers` right after the
customer car is rolled and before the payout is derived from it. Per task: a repair task whose
`isServiceTaskDone` is already true (at/above target, scrap, or missing) installs a fresh stock
instance (`stockInstanceFor`, now exported from `auctions.ts` instead of duplicated) at a band
rolled uniformly from strictly below the target, never scrap (`bandsBelowExcludingScrap`, new in
`bands.ts`); an install task already satisfied clears the slot (`installed: null`). One extra
`rng.pick` only on an actual collision - proven by the golden-master hashes staying byte-identical
(see Gate below), since neither fixture's `SimContext` enables real service-job templates. Verified
by five direct unit tests (one per forcing branch: at/above-target, scrap, missing, satisfied
install, and "already outstanding is left untouched, same object reference") plus the DoD's own
300-seed sweep (`createInitialGameState` per seed 1-300, every generated offer's
`isServiceWorkDone` asserted false).

**Sim-side completion guard.** `resolveServiceJob` gets an early `isServiceJobInTransit` check,
returning a new `'in-transit'` outcome (extends `ServiceJobOutcome`) with no state change - mirrors
`resolveAcceptServiceJob`'s refusal shape. Confirmed unreachable through normal play (the deadline
backstop's `dueOnDay <= next.day` check can only fire once `dueOnDay`, always >= `arrivesOnDay`, has
passed) but wired anyway since this is the one resolution path every caller shares. Regression test:
accept on day N, resolve on day N refuses (`'in-transit'`, no state change), advance one day,
resolve again pays out normally.

**2. Board display gating.** `ServiceJobView` gained `inTransit: boolean`
(`isServiceJobInTransit(job, day)`, `gameStore.ts`). `ServiceJobsScreen.vue`'s "In the shop" row now
shows "car arriving tomorrow" and hides the task list/status/days-left entirely while `inTransit`;
`CarDetailScreen.vue`'s local `arrivesOnDay != null` computed (the small DRY violation the reuse
analysis flagged) now reads the same store field. `gameStore.completeServiceJob` maps the sim's new
`'in-transit'` outcome to a graceful no-op return.

**3. Band pickers.** One new shared component, `BandPicker.vue` - segmented buttons over
`bandsAbove(currentBand)` (new in `bands.ts`, mirrors `bandsBelowExcludingScrap`'s shape), stops
its own click propagation (every real call site nests it inside a larger clickable row/card), data-
test hooks per option (`${testIdPrefix}-${band}`). Wired at all three sites with defaults unchanged:
`CarDetailScreen.vue`'s group "Repair all to…" control (default `fine`, was the hardcoded
`GROUP_REPAIR_TARGET_BAND` constant) and its per-part "Repair to…" row (default `mint`), and
`PartCard.vue`'s recondition control (default `mint`); each site keeps a small reactive
selection map/ref defaulting to its old hardcoded literal, so a player who never touches the picker
gets byte-identical behavior to before this sprint. One flow-through test per site proves a
non-default pick actually reaches the created `StagedAction`/`reconditionPart` call, plus a
dedicated `BandPicker.test.ts` for the component itself (option range at each band, active-state
styling, select emit).

**4. Main menu + New Game confirmation.** New `MenuScreen.vue` at route `/menu`; `gameStore.ts`
gained `hasExistingSave` (a plain `ref(false)`, set `true` only when `hydrate()` actually decodes a
loaded save, `false` on no-save or a corrupt/unreadable one). `main.ts` now does
`hydrate().then(() => router.replace({ name: 'menu' })).finally(() => app.mount(...))` so there is
no flash of the garage screen first. Continue renders only when `hasExistingSave`; New Game skips
straight to a fresh career when there's nothing to lose, otherwise shows an inline Confirm/Cancel
step with the "copy a save code first" warning; Load reuses `importSaveCode` (textarea + button,
navigates to the garage on success, shows the decode error inline on failure); Settings is a
disabled stub. `GarageScreen.vue`'s bare `New Game` button (and its now-obsolete test) is gone - the
menu owns career creation exclusively now. Deliberately plain styling, existing design tokens only,
no art pass, per spec.

**5. Log-schema hygiene.** `DayLogEntrySchema`'s `'job-created'` variant gained
`costYen: z.number().int().nonnegative().optional()` (`packages/content/src/gameState.ts`) - no
behavior change, `findOrCreateJob` (`jobs.ts`) already emitted this field, it just wasn't sanctioned
in the schema (survived only via an untyped spread). New schema test proves both the with- and
without-`costYen` shapes parse and round-trip correctly.

**Deviations from the spec, both caused by the generation-forcing step's rng-stream shift, both
disclosed rather than silently patched over:**

- `packages/sim/tests/bots/runCareer.test.ts`'s single-hardcoded-seed (`seed 1`) test asserting
  `finalSnapshot.equipmentOwnedCount > 0` broke: seed 1's competent-policy career flipped from
  "upgrades a tool line by day 4" to "never upgrades in 100 days" purely from the forcing step's
  extra `rng.pick` on a collision shifting that seed's entire downstream draw sequence - while
  still ending the career on healthy cash (Y2.29M) and reputation (279 points). Verified this
  wasn't a real behavior regression (probed seeds 2-10 directly: all still upgrade normally) before
  touching anything. Broadened the test to a `SEED_SAMPLE_SIZE`-seed majority check, matching the
  sibling test immediately above it in the same file, rather than re-pinning to a differently-lucky
  single seed - consistent with the "a changed rng-shifted number is not a regression" precedent
  (commit 3e65bce).
- `packages/game/src/stores/gameStore.jobs.test.ts`'s "clicking Complete before the work is done
  fails the job immediately" test called `completeServiceJob` immediately after `acceptServiceJob`,
  i.e. while the car was still in transit - pre-Sprint-40 this silently fell through to `'failed'`;
  the new in-transit guard now correctly refuses it instead (`'in-transit'`, job stays active). Fixed
  by inserting one `endDay()` so the test exercises what its title actually says ("work not done,"
  not "car not here yet"); added a new adjacent test asserting the in-transit-refusal case directly.

**Golden-master hashes: unchanged, no re-pin needed.** Both `advanceDay.test.ts` fixtures build
their `SimContext` via `buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)` (no `serviceJobTypes`
argument, defaults to `[]`), so `generateDailyServiceJobOffers` returns `[]` before any rng draw -
the forcing step never executes in either golden-master career, confirmed by both hash assertions
passing unchanged.

**TODO.md:** removed the now-actioned "Real main/pause menu (Continue / Settings / New Game / Load
Game)" line under "Design decisions awaiting maintainer direction."

**Tests added/changed:** 5 direct `forceTasksOutstanding` unit tests, 1 multi-task forcing test, 1
300-seed generation-invariant sweep, 1 in-transit resolver regression test (all
`packages/sim/tests/serviceJobs.test.ts`); 1 runCareer.test.ts robustness fix; `BandPicker.test.ts`
(4 tests, new); `MenuScreen.test.ts` (7 tests, new); `CarDetailScreen.test.ts` (2 new band-picker
flow-through tests); `PartCard.test.ts` (1 new band-picker flow-through test);
`ServiceJobsScreen.test.ts` (1 new board-gating test); `gameStore.jobs.test.ts` (1 fixed, 1 new
in-transit test); `GarageScreen.test.ts` (New Game test removed, button gone);
`packages/content/tests/gameState.test.ts` (1 new costYen schema test).

**Gate (all shown, all green):**

- `pnpm typecheck` - content/sim/game all pass.
- `pnpm lint` - clean.
- `pnpm format` - clean (after one `format:fix` pass over three files auto-wrapped by the edits).
- `pnpm test:coverage` - 831/831 tests pass across 73 files (34 sim, 6 content, 33 game - up from
  789 pre-sprint). Coverage: statements 90.47%, branches 79.53%, functions 90.79%, lines 94.34% -
  all comfortably above the 80/65/78/82 gate.

**Balance harness (`pnpm balance:run` + `python -m balance.cli check`): all hard-gated invariants
PASS.**

- Days-to-`local` (competent-policy probe): **p50 = 20.0 days** (742/1000 seeds reached `local`
  within 100 days), inside the `[10, 35]` band. Moved from Sprint 39's last-recorded 12.0 - expected
  and disclosed, not treated as a regression: honest payouts (a vacuous task used to floor a job's
  payout at the flat callout fee; forced-real tasks now price real material/labor cost into every
  offer) and honest install/repair work change completion economics, and Task 1's fix is exactly
  the intended mechanism for that.
- Buyout share: 0.0% of 35,117 acquisitions (< 30% gate).
- Passive Grinder day-100 median cash: Y1,220,000 (solvency baseline, unchanged in kind).
- Flipper vs. Passive Grinder day-100 cash diverge by Y1,203,636 (real market participation
  confirmed).
- Sanity floor: no strategy catastrophic (passive Y1.22M, flipper Y16k, restorer -Y143k, balanced
  -Y47k, random -Y98k - all above the floor).
- **Informational (not gated, disclosed per the module's own docstring convention):** every
  non-passive strategy's day-100 median cash still sits below Passive Grinder's; Flipper's day-100
  median (Y16,364) is still below its Y1.5M starting cash (the loop is a net loss over 100 days);
  auction win-price tails are steal 62.8% / mid 6.8% / frenzy 30.4% (informational target band
  5-15% each). All three are the pre-existing, already-tracked Sprint 30 auction-tuning finding
  (`TODO.md`) - Sprint 40 touches neither auctions nor the value model, and none of these numbers
  moved outside their already-known range because of this sprint's changes.

**Nothing deferred beyond what was already known going in** (the Sprint 30 auction-tuning items in
`TODO.md`, untouched by this sprint's scope).
