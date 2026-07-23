# Sprint 116: The Master Inspector (the diagnosis opt-out you hire)

**Date:** 2026-07-23. Source: the maintainer's proposal (2026-07-21, ruled v1.0, recorded in
TODO.md) and the D4 pick clearing it to build. No new tunables anywhere: the wage formula
prices the hire, the visit's minute budget prices the work, so directive 22 has nothing to
gate; implementation cleared.

**One-line goal:** a hireable who reads the failure map for you: engaged players keep their
edge free, disengaged players pay wages for theirs.

## Reuse analysis (directive 16)

**Reused:** the staff system wholesale (roll pool, wages, bench assignment; the trait joins
`traits.json` beside auction-rat, which already proves traits may touch inspection); the
REAL diagnosis path (`runDiagnosticTest`, minute charging, the trail and its result lines:
the inspector plays the same game, the player just does not choose); the optimal-route
walker already written inside `diagnosisRouteProbes.test.ts` (extracted into sim as a pure
helper; the probes then import the sim version and must stay byte-identically green,
proving the extraction changed nothing); the visit system's budget as the only limiter.

**Genuinely new:** the `master-inspector` trait entry (copy below); one pure resolver
(walk the optimal route on a lot until resolved or the minutes run out); one per-lot
control during an active visit when the inspector is benched.

## Design

1. **The trait:** joins the candidate roll pool like any other. The hire is deliberately
   ordinary otherwise; the trait is the value, and it works only from the bench (the
   auction-rat precedent: benched hands are yours).
2. **The resolver:** during an active inspection visit, one action per lot: the inspector
   walks that lot's symptoms by the same expected-minutes-optimal policy the route probes
   already encode, running REAL tests through `runDiagnosticTest` (minutes charged, trail
   filled, result lines identical to a perfect manual player). Stops when every symptom
   resolves or the visit budget runs dry. Deterministic for a given lot and budget.
3. **No automation beyond the button:** one send per explicit player action per lot;
   nothing runs on day boundaries; the player still chooses where the minutes go.
4. **Authored copy (orchestrator-personal, verbatim):**
   - Trait name: "Master inspector"
   - Trait description: "Finds every fault in a car. Has never once offered to fix one."
   - The send control: "Send {name} to listen"
   - The done line (trail-side, after their pass): "{name} hands the sheet back without a
     word."

## Tasks

- [x] Content: the trait entry (copy verbatim); TraitIdSchema widened; ids cross-checked.
- [x] Sim: walker extracted, resolver + gate landed, twelve resolver probes.
- [x] Game: the send control and done line on the yard checklist, four screen tests.
- [x] Orchestrator: copy sweep, verification, Exit.

## Exit

- [x] The trait is live and findable: `master-inspector` joins the candidate roll pool
      (which widened the pool 5 -> 6 and honestly re-pinned the 30-day golden,
      64522008 -> 577b2daf, an intended consequence of a bigger pool, not a regression).
      Copy byte-verbatim and guard-asserted.
- [x] The brain moved without changing: the expected-minutes-optimal walker extracted from
      the route probes into `diagnosis.ts` (`bestRouteMinutesToResolve`/`bestNextTestId`
      over one shared search); the probe file's only edit is the import swap, and its 91
      assertions passed unchanged: the extraction proved itself.
- [x] The resolver plays the real game: `resolveSendInspector` walks each symptom by the
      optimal policy through the REAL `runDiagnosticTest` (true minute charging, true
      trail, true result lines), stopping honestly the instant the next optimal test does
      not fit the remaining budget. Seven gate reasons; deterministic; twelve probes.
- [x] The yard control renders only when the gate passes ("Send {name} to listen"; the
      done line "{name} hands the sheet back without a word.", both byte-verbatim); the
      tutorial is naturally excluded (tutorial careers start with no staff: verified in
      `newGame.ts`/`tutorial.ts` by reading, no special case written).
- [x] Judgement calls endorsed on review: the two UI lines live in the component beside
      the existing hardcoded checklist copy (content-law precedent: sim-consumed copy goes
      to content, UI chrome does not); the done line is screen-local and ephemeral (the
      durable version is a real design decision, deferred deliberately); the walk is
      symptom-scoped like the probe policy, no invented cross-symptom optimality.
- [x] No numeric tunable was added anywhere; `economy.json` untouched, the approval gate
      unmoved.
- [x] Evidence: sim 56 files / 1,392 passed; content 14 files / 121 passed (hygiene guard
      included); game 55 files / 678 passed; typecheck clean. The pre-push hook is the
      full gate.
