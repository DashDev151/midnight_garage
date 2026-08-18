# Sprint 198: the career flow meter

**Status: DESIGNED, implementing.** Workstream A1 of the economy overhaul brief
(`docs/reviews/economy-overhaul-brief.md`), the arc's declared prerequisite for touching
any economy value (D12). Board: `docs/sprints/integration-arc.md`.

**Levers: NONE.** This sprint measures; it moves nothing. Any lever question it raises is
recorded, not acted on.

**Why now, plainly:** Sprints 201 to 203 changed the economy's shape (machine hire
converted to a labour rate, body labour cut by roughly three quarters) and nothing in the
repo can say what that does to a career. The closed-form probes check worst cases; the
bench answers one car at one moment. Nobody can answer "what does week six feel like",
which is the question every tuning argument in this project has been conducted without.

## The design in one paragraph

A golden career is a **recorded session replayed deterministically**. It has no decision
policy, so it cannot drift into unrealistic play: it is a regression instrument, not an
AI (this is the whole difference from the condemned bot harness, directive 21, which
stays condemned). Sprint 202 already made this nearly free: every player action logs a
typed session event, and the export bundles those actions with a per-day cash ledger. The
career script IS that action stream plus checkpoints; the runner is an interpreter over
it; the report is the aggregator's output.

## Reuse analysis (directive 16)

**Existing mechanisms reused:**

- `advanceDay(state, actions, seed, context) -> { state, log }` and the golden-master
  driver pattern in `advanceDay.test.ts` (instant resolvers between days, `DayActions`
  within a day, `hashState` pins). The runner generalises that driver; it invents no
  execution model.
- The Sprint 202 session log: typed events at every player action, cleared per career,
  exported as a bundle with a career id and the per-day ledger.
- `cashMovementFor` (`packages/content/src/cashLedger.ts`), the single exhaustive cash
  classification law. The flow table derives from it. A second mapping is banned.
- `financeLedger`'s weekly five buckets as the reconciliation target: the flow table must
  agree with it to the yen or the instrument is lying in a new way.
- `hashState` for checkpoints; `CareerSnapshot`'s per-day shape from `bots/runCareer.ts`
  (already curves over days) for the report's series; the CLI build pattern
  (`tsconfig.cli.json` plus the two post-build fixups) for the runnable command.
- Sim resolvers as they are. The interpreter calls the same functions the store calls.

**Genuinely new:** the typed session-event vocabulary in content (today `type` is a bare
string), the career-script schema, the replay interpreter, the per-day flow aggregator,
and the report renderer.

## Tasks

### A. The event vocabulary becomes typed (kills the drift risk structurally)

- A1. Move the session event vocabulary into `packages/content` as a discriminated union
  with a payload schema per event type, covering every type the store logs today
  (including Sprint 202's `repair`, `install`, `pipelineStage`, `pipelinePaint`,
  `removePanel`, `installPanel`, and the enriched `acceptOffer`, `completeServiceJob`,
  `checkoutCart`).
- A2. `logSessionEvent` accepts only that union; the interpreter consumes the same union
  with an exhaustive switch. A store action that logs an event the interpreter cannot
  replay is a compile error, not a silent replay gap. This is the one structural
  guarantee that keeps the instrument honest as the game changes.
- A3. A test asserting every `logSessionEvent` call site's type is in the union (the
  compiler enforces the direction that matters; this catches the reverse).

### B. The career script

- B1. Schema: an ordered list of days, each carrying its typed events in recorded order,
  plus optional checkpoints (`hashState`, or named assertions on cash, labour, standing,
  cars owned). Round-trips through JSON.
- B2. Converter: an exported session bundle becomes a script. Given A1 this is close to
  an identity map; it fails loudly on an event type it cannot place, never silently.
- B3. A smoke script whose only job is to exercise the runner, labelled synthetic in its
  own header so it can never be mistaken for a baseline.

### C. The replay runner (pure, in `packages/sim`)

- C1. Deterministic interpreter: for each day, apply that day's events in order through
  the same sim resolvers the store wraps, then `advanceDay` with the day's seed. Same
  script plus same seed reproduces the same `hashState` sequence, asserted.
- C2. Checkpoint evaluation: a failed checkpoint reports the day, the expected band and
  the actual figure. Disclosure by default (brief A.5): nothing hard-gates until the
  maintainer signs specific curve properties, per the Sprint 69 lesson that a gate on an
  unrepresentative instrument is worse than no gate.

### D. The flow meter

- D1. Per-day aggregator: classify every day's `DayLog` through `cashMovementFor` into
  the five buckets, per day, as a time series. Capture the in-day resolver logs too, not
  only `advanceDay`'s return.
- D2. Reconciliation test: the flow table's weekly rollup equals `financeLedger` for that
  week, to the yen, on every shipped script.
- D3. Series alongside cash: labour used against the day's pool, scene standing, cars
  owned, net worth estimate.

### E. The report

- E1. `pnpm career:report` renders one page per script: the cash curve per day, labour
  utilisation per day, standing per day, and the faucet and sink table per week by
  category. Curves, not endpoints.
- E2. Generated on demand, never committed. A committed report goes stale and lies, which
  is exactly how the old balance report died.

## Definition of done

- [x] One command produces, for each script, a page a tired person can read in a minute.
- [x] The flow table reconciles to `financeLedger` to the yen.
- [x] Replay is deterministic and proven so; the smoke script passes end to end.
- [x] An unreplayable event type is a compile error.
- [x] No lever moved. Findings recorded in the sprint doc's Exit, not acted on.

## Blocked, and not blocking

The first TRUE golden career needs one recorded session on the current build (integration
board gate G1). The two archived 2026-08-13 sessions speak the pre-202 vocabulary and are
kept as historical artefacts only. Everything in this sprint is built and proven without
them.

## Exit

All five tasks (A through E) landed. No lever moved; three findings below are recorded, not acted
on.

### A - the vocabulary is typed, and it caught a real gap immediately

`packages/content/src/sessionEvent.ts` is the discriminated union: `SessionEventInputSchema` (the
`{type, payload}` pair every store action builds) is authored once, and `SessionEventSchema` (the
persisted row - `id`/`day`/`timestamp` plus that pair) is derived from it by intersection rather
than a second hand-authored union, so the two can never drift. `logSessionEvent` in
`gameStore.ts` now takes `SessionEventInput` only; all 48 of its call sites were converted from the
old `logSessionEvent('type', {...})` shape to `logSessionEvent({ type: 'type', payload: {...} })`.

**Turning the type on found a real coverage hole the design didn't anticipate**: `staffStore.ts`
also calls `game.logSessionEvent(...)` for `hireStaff`/`dismissStaff`/`reassignStaff` (3 more call
sites, 51 total), missed by the original gameStore-only read. `pnpm typecheck` caught all three
immediately once the union tightened - exactly the structural guarantee A2 was built for. The
vocabulary now covers all 51; A3's coverage test was broadened to scan every `.ts` file under
`packages/game/src`, not only `gameStore.ts`, so this class of miss cannot recur silently
(`packages/game/src/sessionEventCoverage.test.ts`).

**Finding, not acted on**: `hireMachineLine` (`gameStore.ts`) pushes a day log but never calls
`logSessionEvent` at all - it has no session-event coverage today, pre-dating this sprint. A real
recorded session that used the machine shop would replay with the day's machine-line hire silently
absent. Out of scope here (Task A covers "every type the store logs today"); flagged for whoever
next touches session logging.

### B - the script schema, the converter, and the smoke fixture

`packages/sim/src/careerScript.ts`: `CareerScriptSchema` (an ordered day list, each carrying typed
events and optional checkpoints) and `sessionBundleToScript` (the exported-bundle-to-script
converter, near-identity given A, fails loudly via `SessionEventInputSchema.safeParse` on anything
it cannot place).

**Finding, not acted on**: the session-export bundle (`SaveMenu.vue`) never records the career's
seed (`newGame`'s own seed is `randomSeed()` and is never itself a logged event), so
`sessionBundleToScript` takes `seed` as an explicit second argument rather than reading it off the
bundle. A real recorded session needs its seed noted down separately at New Game time to become a
replayable script.

`packages/sim/src/careerScripts/smoke.script.json`: labelled `"synthetic": true` in its own header,
10 days against seed 1's real day-1 board (ids discovered by running the actual resolvers, not
invented) - a buyout, a cart checkout, a part sale, a declined service-job offer, a
tutorial-step acknowledgement, then idle days that carry the career past the day-7 rent boundary.

### C - the replay runner, proven deterministic

`packages/sim/src/careerReplay.ts`: `applySessionEvent` is the exhaustive switch over
`SessionEventInput` (51 cases, one per vocabulary member, no `default` - TypeScript's own
control-flow exhaustiveness check is the enforcement, matching `cashMovementFor`'s own idiom).
`replayCareerScript` drives it: apply a day's events through the same resolvers the store calls,
then `advanceDay` once with an empty `DayActions` batch and `state.seed + state.day`. Two events
are deliberately no-ops in the switch: `endDay` is positional (the interpreter's own per-day loop
already calls `advanceDay` once per script day) and `acknowledgeTutorialStep` has no sim resolver
at all (the store mutates state directly; the interpreter mirrors that same mutation).

Determinism is asserted directly: replaying the smoke script twice against the same seed produces
identical `hashesByDay` sequences and an identical final state (`careerReplay.test.ts`). The
sequence is also pinned against a real run, the same golden-master idiom `advanceDay.test.ts` uses.

### D - the flow meter, reconciled to the yen - after a real bug

`packages/sim/src/careerFlow.ts`: `dayFlowFor` classifies one day's whole log (events plus that
day's `advanceDay` return) through `cashMovementFor`; `weeklyFlowFor` rolls the series up to
`financeLedger`'s own weekly grain.

**The reconciliation test caught a genuine bug on its first run** (directive 17, case b): the first
`weeklyFlowFor` created a zeroed week entry for every day present in the series, including wholly
idle days, so a career running past a week boundary with no further cash movement produced an
extra all-zero week `financeLedger` never recorded (it only creates a week entry when a real
nonzero movement occurs). Fixed by skipping a day with no nonzero bucket before touching the week
map - `careerFlow.test.ts`'s reconciliation test now passes, and the fix is what made the real
`career:report` output for the smoke script show exactly one week (`week 1`), matching
`financeLedger` exactly rather than a phantom `week 2`.

### E - the report

`pnpm career:report` (`packages/sim/src/cli/careerReport.ts` + `careerReport.ts`'s pure renderer,
same CLI build pattern as `balance:run`) renders one markdown page per `*.script.json` fixture to
`tools/career-report/output/` (gitignored, generated on demand, never committed). One page:

```markdown
## Weekly cost sheet

| Week | Income | On cars | Stock | Running | Investment | Net |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | ¥7,680 | ¥74,823 | ¥28,160 | ¥20,000 | ¥0 | ¥-115,303 |
```

Full sample run and per-file test totals are in the implementing session's own report. Definition
of done above is checked off in full; three findings recorded, none acted on.
