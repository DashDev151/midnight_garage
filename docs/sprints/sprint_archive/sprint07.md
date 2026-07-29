# Sprint 07 - Persistence & the durable loop

*Source: roadmap Phase 2, Sprint 7: "Persistence & the first full loop - Dexie autosave on End Day +
versioned schema + export/import string (R2 mitigations in from the start). End-of-day report
screen." Engineering law 4 (the Save law) + risk R2 (Safari ITP eviction). Builds on the Sprint 06
loop. Status: **implemented and locally verified - ready for review.***

## Goal

Make the game **survive a refresh**. Right now everything is in memory - close the tab and your
career is gone, which is the single biggest thing standing between "a playable demo" and "a game."
This sprint adds durable saving (Dexie/IndexedDB autosave), a copy-paste **save code** as insurance
against Safari evicting storage (risk R2), and an **end-of-day report** so each turn lands with a
beat. After this, the buy -> build -> sell loop is something you can return to tomorrow.

Then service jobs (the agreed next-next feature) hang off a game that actually persists.

## Definition of Done (from roadmap)

- The game **autosaves** (Dexie/IndexedDB) so a refresh resumes exactly where you were.
- The save schema is **versioned**, with a migration path and a **golden-save test** (the Save law).
- A prominent **export/import save code** round-trips a career through a copy-paste string.
- An **end-of-day report** summarizes what happened each day (money in/out, sales, events).
- `navigator.storage.persist()` is requested (R2).
- All checks green; new codec + store tests pass.

## Decisions (proceeding as stated unless you object)

1. **Single autosave slot, not manual/multiple saves.** v1 autosaves one career; refresh resumes it.
   Named slots / manual save-as are deferred - the roadmap says "autosave," and one slot keeps the
   Save law simple. (Export codes cover "back up / branch" needs in the meantime.)
2. **Persist `gameState` only; the event log is session-ephemeral.** `gameState` is the Zod-validated
   canonical object. The scrolling event log resets on load (it grows unbounded over a long career;
   not worth persisting), and the end-of-day report is derived per-day, never stored. Keeps saves
   small and the Save law's surface minimal.
3. **Split a pure `saveCodec` from a thin Dexie IO wrapper.** `saveCodec` (serialize / deserialize /
   validate via `GameStateSchema` / migrate-by-version) is pure and **fully unit-tested - this is
   where the golden-save + migration tests live**, and it needs no IndexedDB. `saveDb` is a thin
   Dexie read/write/clear wrapper, **no-op when IndexedDB is unavailable** (so store tests under
   happy-dom are unaffected) and eyeballed in the browser. This deliberately avoids adding a
   `fake-indexeddb` test dependency now; if we later want the IO path auto-tested, that's a small
   future devDep decision.
4. **Export/import = a versioned base64 "save code"** (the diegetic "garage insurance papers", R2).
   Import base64-decodes -> JSON -> `GameStateSchema.parse` -> migrate if older -> load. A version
   prefix guards against pasting garbage.
5. **Autosave via a store watcher on `gameState`** (fire-and-forget), so *every* mutation persists -
   End Day, sells, dev grants - not just the day tick. Resilient: a failed/absent IndexedDB never
   throws into gameplay.
6. **End-of-day report is a dismissable modal**, shown after End Day on whatever screen you're on
   (garage, auctions, parts, car detail) - a report *route* would fight the multi-screen flow. It
   shows the day's log entries + the cash delta, with a Continue button.
7. **Save law, established here and enforced forever after:** `SAVE_VERSION = 1` this sprint; the
   golden-save test pins a known save code and asserts it still loads. **Any future `GameState`
   schema change = version bump + a migration + an updated golden-save test, in the same PR.** This
   is the first save ever written, so we set the discipline now.

## Stack additions

- **`dexie`** (dependency, `packages/game`) - already in the locked stack (GDD §13), so no new
  approval; just not installed until now. No new *test* dependency (decision 3).

## Task breakdown

### A. Save codec - pure, versioned, tested (`packages/game/src/save`)

- [x] `saveCodec.ts`: `SAVE_VERSION` (1), `encodeSave` (wrap `{ version, gameState }` -> JSON ->
  UTF-8-safe base64 with an `MGSAVE1.` prefix), `decodeSave` (prefix check -> base64 decode -> JSON
  -> `migrate` -> `GameStateSchema.parse`, with friendly errors for garbage / newer-version codes).
  `migrate` runs a per-version `MIGRATIONS` chain (empty today - the seam for future bumps).
- [x] `saveCodec.test.ts`: **golden-save** - a pinned save code decodes to the expected `GameState`;
  a full career state round-trips encode->decode unchanged and re-validates; a bad/garbage code
  throws cleanly; an unknown/too-new version is rejected gracefully.

### B. Dexie IO wrapper (`packages/game/src/save`)

- [x] `saveDb.ts`: a Dexie DB (one `save` row, keyed slot `"current"`), `loadSave()`, `writeSave()`,
  `clearSave()`. Guards `typeof indexedDB === 'undefined'` -> no-op. Requests
  `navigator.storage.persist()` once on the first write (R2).

### C. Store integration (`packages/game/src/stores/gameStore.ts`)

- [x] `hydrate()`: async; on startup, load the save code from Dexie -> `decodeSave` -> replace
  `gameState`; on any failure or absence, keep the fresh new game. Called from `main.ts` before/at
  mount.
- [x] Autosave: watch `gameState`, `writeSave(encodeSave(gameState))` (fire-and-forget, `flush:
  'post'`). `newGame` overwrites via the same watcher; `saveDb.clearSave()` exists as a primitive
  for a future explicit reset (not wired to a store action this sprint).
- [x] `exportSaveCode()` / `importSaveCode(code)` actions using the codec; `importSaveCode` validates
  and replaces state (or reports a friendly error).
- [x] Track `lastDayReport` ({ day, entries, cashDeltaYen }) captured in `commitDay`/`endDay` for the
  report modal.

### D. End-of-day report (`packages/game/src/components`)

- [x] `DayReport.vue`: a dismissable modal driven by `lastDayReport` - day number, cash delta
  (colored +/-), and the day's events (via `describeLogEntry`), with a Continue button that clears
  it. Shown after any End Day.

### E. Save-code UI (`packages/game/src/components`)

- [x] A small, prominent **Save** affordance in the app chrome (header menu or a panel): "Copy save
  code" (writes `exportSaveCode()` to clipboard) and a paste-to-import field, with a one-line "this
  is your backup - Safari can forget the game" nudge (R2 diegetic framing). Kept simple.

### F. Testing

- [x] Codec tests (group A) - the golden-save + round-trip + rejection cases.
- [x] Store: `hydrate()` restores a career from a save code; `importSaveCode` replaces state and
  rejects garbage; `newGame` resets; the autosave watcher is a no-op-safe call under happy-dom.
- [x] `DayReport` (mounted): renders the day's cash delta + events; Continue dismisses.
- [x] Full `pnpm typecheck / lint / format / test / build` green - **170 tests across 38 files**
  (was 160/35); +10 this sprint (codec golden-save/round-trip/rejection, store export-import +
  report, mounted DayReport). No sim/content change, so the sim golden-master is untouched.

## Claude-implementable vs user-only

**Claude-implementable:** all of A-F (game-layer + the pre-approved `dexie` dep). No sim/content
changes - `GameState` is already the Zod-validated persist target.

**User-only:** run `pnpm dev`, play a few days, **refresh the tab** and confirm the career resumes;
copy a save code, New Game, paste it back, confirm restore. (This is the one bit only a real browser
proves - the codec is unit-tested, but the Dexie IO + clipboard are eyeballed.)

## Exit

With Sprint 07 the loop is **durable** - a career survives a refresh, and a save code survives even
Safari's storage eviction. That clears the way for **service jobs** (the agreed next focus: the Act 1
early-game floor + tutorial vehicle) to be built on a game people can actually return to, and for the
**Fun Gate** - five strangers, 30+ minutes, "one more day" - which needs saving to be a fair test.
