# Sprint 28: Drill-down UI and the parts catalog remap

*Source: maintainer playtest 2026-07-11 (`docs/playtest-notes-2026-07-11.md`, notes 9
(remainder)), the rotary content hole found during triage, and the maintainer's 2026-07-11
additions: NA forced-induction installs (turbo or supercharger) and underglow kits. Status:
**designed, ready to implement.** Depends on Sprints 26-27. Single Sonnet implementation
agent; read `CLAUDE.md` first; no em dashes.*

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- The Sprint 24 `.meter-line` / `.action-line` row pattern in `CarDetailScreen.vue`: sub-part
  rows are the same two-line structure one indent level deeper; design tokens
  (`--mg-fs-*`, `--mg-space-*`) throughout.
- The staged-work confirm flow and ReplaceDrawer: unchanged mechanics, retargeted to a
  sub-part address.
- `partFitsCar` tag logic and the Naming Layer / parody-brand rules for all new catalog
  entries; the naming-layer CI test must stay green.
- Sprint 25's tooltip pattern for equipment locks; Sprint 26's display-name content.

**Genuinely new mechanisms:**

- Expandable group rows (pure UI state; no sim change).
- A shared band formatter/chip component for the five conditions (scrap/poor/worn/fine/mint,
  from Sprint 26's content tables).
- A rotary marker glyph on rotary-only part cards (a small triangle: semantic, so allowed
  under the no-decorative-Unicode rule).

## Goal

Make the granular model playable and legible: the car page drills from 6 group bars into
sub-part rows with their own repair/replace actions, the parts market speaks sub-parts, and
the catalog actually covers the taxonomy (today it cannot: verified during triage that zero
Rotary-tagged parts exist, so the FC and FD RX-7s can never receive any engine or forced
induction part; and whole sub-part classes like tyres, dampers, seats have no parts at all).

## Design decisions (locked)

1. **Car page:** 6 group rows (aggregate band chip + bar), each expandable to its part rows
   (name, band chip, Repair-to-target-band / Replace on the action line). Group-level
   "Repair all to fine" survives as a convenience on the group action line, skipping any
   scrap part it can't touch. A **scrap** part row shows Replace only: no Repair control at
   all, per Sprint 26 decision 5 (repair is structurally unavailable, not merely disabled).
   No percentages appear anywhere: the band IS the condition (Sprint 26).
2. **Copy rules:** display names only, no raw ids anywhere (extends Sprint 25 task 6); no
   `requiredTags` jargon on part cards: fit is shown as fit ("doesn't fit this car" dimming
   stays), and rotary-only parts carry the small triangle marker with a tooltip. Equipment
   locks are tooltips (never inline strings).
3. **Parts market and drawer:** filter/group by group then part; the drawer for a part shows
   only catalog parts addressed to it that fit the car. The parts inventory screen renders a
   **Scrap it** button on any scrap-band `PartInstance` card (Sprint 26 decision 6), paying
   `scrapValueYen` and removing it; a scrap card never shows an Install/fit option anywhere,
   since the fit-check rejects it universally.
4. **Catalog expansion (content):** add parody-brand entries so every car part that
   reasonably has an aftermarket has at least stock and street options for common platforms:
   a rotary line (internals/apex-seal kit, rotary turbo kits, rotary ECU), forced-induction
   kits in BOTH flavors (turbo and supercharger) installable on NA cars via the universal FI
   slot, and underglow kits for the underbody slot (style). Target roughly 25-35 new
   entries; prices set relative to `parts-taxonomy.json` repair economics so
   replace-vs-repair is a real choice, not dominated either way. This is designer bait: flag
   every priced entry in the sprint Exit for maintainer tuning.
5. **Auction surfaces:** already transparent (Sprint 27 built the card chips and the
   read-only parts list). This sprint only unifies them onto the same shared row/chip
   components as the owned-car page and polishes density. Nothing is estimated, hidden, or
   revealed; there is no inspection.

## Definition of Done

- Drill-down works keyboard-and-pointer (the pick-mode accessibility fallback still covers
  drag interactions); no layout regressions on the other screens.
- Catalog validation tests: every car part with a Replace button has at least one fitting
  part for at least one roster car; every rotary-tagged car has fitting engine/FI options;
  at least one turbo kit, one supercharger kit, and one underglow kit exist and install on
  an NA piston car; naming-layer test green; no guaranteed-loss interaction with Sprint 25's
  job-payout invariant test.
- Full gate green; component tests for expand/collapse, sub-part staging, drawer filtering.

## Tasks (Claude-implementable)

- [x] CarDetailScreen drill-down (rows, bands helper, findings badges, group repair-all).
- [x] PartCard/ReplaceDrawer/PartsMarketScreen re-grouping + copy rules + rotary marker.
- [x] AuctionScreen estimated/true compact bars.
- [x] Content: catalog remap audit + ~20-30 new entries (rotary line included).
- [x] Tests per DoD; Exit section.

## User-only tasks

- [ ] Visual pass on the drill-down and the auction card density; price-tune the new catalog
  entries in JSON.

## Exit

**Status: implemented, full gate green, ready for review.**

### Scope note on the catalog task

The catalog-expansion task above shows complete because the DoD's own catalog obligation for
this sprint - validation, not authoring - is complete: the prior content pass (noted in this
sprint's own briefing) had already grown `parts.json` from 20 to 119 entries, including the
rotary line, both FI flavors, and an underglow kit. `parts.json`/`parts-taxonomy.json` stayed
frozen throughout this implementation, exactly as scoped; nothing in them was added, edited, or
reordered.

### The addressing-model decision

`StagedAction` (content/stagedWork.ts) and `Job` (content/job.ts) both gained one new **optional**
field, `carPartId`, on their existing `repair`/`install` and `repair-zone`/`install-part` kinds -
no new discriminated variants. Absent, behavior is byte-identical to pre-Sprint-28: a `repair`
climbs every eligible part in the group; an `install` targets whichever slot the picked catalog
part's own address resolves to. Present, a `repair` climbs only that one part, and an `install` is
additionally checked against that exact slot. `NewJobSpec` (sim/actions.ts) mirrors the same
optional field. This was chosen over new variants because the two modes share every field and all
existing resolution logic - the field distinguishes *scope*, not *kind* - and it means bots
(`bots/bandHelpers.ts`'s `queueGroupRepair` et al.) needed zero changes: they simply never set the
new field, so every queued spec stays group-level exactly as before.

Job/stage identity is now address-aware: `jobs.ts`'s `jobIdFor` folds `carPartId` into the id
(`job-<car>-<kind>-<component>[-<carPartId>]`) so a per-part job on `intake` and one on `exhaust`
(same `engine` group) can be open at once without colliding, and never collides with a group-level
job on the same group. A new shared helper, `packages/game/src/utils/partAddress.ts`
(`addressesOverlap`/`sameAddress`), is the one place that decides whether two addresses collide
(a group address covers every part inside it) - used both by `gameStore.ts`'s staging/busy gates
and by `CarDetailScreen.vue`'s per-row lookups, so "is this address already busy" has exactly one
definition. `stageAction`'s decision-4/decision-8 gates (busy-blocks-staging; re-staging displaces
what's there) now use this generalized to per-part: a group-level stage displaces every per-part
stage inside that group and vice versa; two per-part stages on different parts of the same group
coexist freely - this is the sprint's headline behavior (working `intake` and `exhaust` at once).

Two real correctness gaps got closed as a side effect of adding per-part addressing (not scope
creep - the old group-level check structurally couldn't express these):
`installFitGate`/`gameStore.installablePartsForPart` now check the SPECIFIC slot's own occupancy
and the catalog part's exact `carPartId`, not just "the group has *some* empty slot somewhere" -
previously a part could be offered as fitting even when its own slot was occupied, silently
failing at completion (`blockedByOccupiedSlot`). And the drill-down's part rows iterate every
part the taxonomy assigns to a group (not just present ones), so the one conditional slot
(`forcedInduction` on an NA car) now renders a "not fitted" row with a working Replace action -
previously invisible, which is exactly what blocked fitting a turbo/supercharger kit onto an NA
car through the old group-scoped UI.

The group's own convenience is now literally "Repair all to fine" (`GROUP_REPAIR_TARGET_BAND =
'fine'` in `CarDetailScreen.vue`), not "to mint" - read literally from this sprint doc's locked
decision 1 wording. This is a genuine behavior/balance change on the player-facing convenience
button only (bots' `queueGroupRepair` stays hardcoded to `'mint'`, untouched, per the brief's
"prefer keeping bots on group repair unchanged"). **Flagging this explicitly per CLAUDE.md
directive 6**: if "to fine" was meant loosely rather than literally, it's a one-line revert
(`'fine'` -> `'mint'`) in that one constant.

### Save migration

**`SAVE_VERSION` bumped 16 -> 17, no `MIGRATIONS` entry.** These are two separate Save-law
obligations (engineering law 4), and this change needs the first but not the second. `JobSchema`
and `StagedActionSchema` (both persisted - `state.jobs` and `state.stagedCarWork`) each gained one
`.optional()` `carPartId` with no `.default(...)`, so an absent `carPartId` stays `undefined` on
decode and a group-level `Job`/`StagedAction` encodes byte-identically pre- and post-Sprint-28:
this is the normal additive case (like v2-v8), so NO migration transform is needed - a v16
group-level save decodes unchanged under v17. The version bump itself is still required, and is
what makes a pre-Sprint-28 client REJECT a Sprint-28 save (`decodeSave`'s
`envelope.version > SAVE_VERSION` throws "newer version") rather than silently strip the unknown
`carPartId` via Zod and degrade per-part staged work back to group-level - the guard that a
stay-at-16 would have removed. (My first pass wrongly conflated "no migration needed" with "no bump
needed" and stayed at 16; the verifier caught it, and it's fixed here to v17 with the reasoning
above.) Documented in `saveCodec.ts`'s `SAVE_VERSION` doc comment (the `- v17 (Sprint 28, ...)`
entry, in the established version-history style). Three regression tests in `saveCodec.test.ts`
(immediately before the v15->v16 migration `describe` block) cover it: a real pre-v17 (v16
envelope) save with only group-level jobs/staged work decodes cleanly under v17
(additive backward-compat), a group-only v17 state round-trips unchanged, and a per-part v17 state
round-trips its `carPartId` exactly. The existing "refuses a save from a newer version" test uses
`SAVE_VERSION + 1`, so it holds automatically at the new value.

### Catalog validation test results

All pass against the frozen catalog - no gap to report:

- Every one of the 29 real car parts has at least one catalog part addressed to it that fits at
  least one roster car.
- Every Rotary-tagged roster car (both RX-7s) has a fitting catalog part for every real
  engine-group part, including `forcedInduction`.
- At least one turbo kit, one supercharger kit, and one underglow kit fit an NA, Piston roster
  car (Honda City E (AA)).
- The naming-layer real-brand test (`naming.test.ts`) stays green, unmodified.
- Sprint 25's install-job payout 1.2x-floor invariant (`integrity.test.ts`, pre-existing test)
  stays green, unmodified - it already validates dynamically against whatever's in `parts.json`,
  so it already covers the expanded catalog.

New tests live in `packages/content/tests/integrity.test.ts`'s existing `referential integrity`
describe block (three new `it`s, same file/pattern the Sprint-25 invariant test already used).

### Real bugs found and fixed along the way

Two genuine pre-existing/newly-introduced bugs surfaced while writing component tests, both fixed
in this PR (not scope creep - both block the sprint's own drill-down/scrap-button work from
functioning at all):

1. **`PartCard.vue` pointerdown/pointermove/pointerup ternary bug** (introduced by my own first
   draft of the scrap-card gating, then fixed within this same sprint): binding
   `@pointerdown="isScrap ? undefined : draggable.onPointerDown"` directly in the template compiles
   to a handler that *returns* the function reference instead of calling it, silently breaking drag
   start for every non-scrap card. Fixed by wrapping in three named functions
   (`onPointerDown`/`onPointerMove`/`onPointerUp`) that call through only when not scrap.
2. **Cross-test Pinia identity leak in `CarDetailScreen.test.ts`** (a latent risk in the existing
   `mount()`-without-`unmount()` pattern this file already used pre-Sprint-28, newly exposed by
   this sprint's specific test sequence): Pinia's `getActivePinia()` prefers an injected pinia from
   the current Vue injection context over the module-level "active" one
   (`hasInjectionContext() && inject(piniaSymbol)`, checked before the `setActivePinia` fallback).
   A `CarDetailScreen` instance left mounted from a prior test (never explicitly unmounted) can
   leave that injection context resolvable later, so the next test's freshly-created pinia loses to
   the stale one - confirmed by direct reference-identity logging during triage. Fixed by tracking
   every `mountAt`-produced wrapper and unmounting it in `afterEach`. **Flagging for the
   orchestrator**: this class of risk likely exists in other test files using the same
   mount-without-unmount pattern (e.g. other `*.test.ts` files that call `mount()` many times per
   file); none hit it today (verified: full suite green both before and after this fix), so no
   other file was touched - a repo-wide audit is out of this sprint's scope but worth a TODO.md
   entry if the maintainer wants it tracked.

### Golden hashes re-pinned

None. No existing save-golden literal (`GOLDEN_V*_CODE` constants in `saveCodec.test.ts`) needed
re-pinning - the addressing change added no default-fill and touched no existing schema shape.

### Final gate summary

```text
pnpm typecheck   -> content: Done / sim: Done / game (vue-tsc): Done
pnpm lint        -> eslint . : clean, exit 0
pnpm format      -> prettier --check . : "All matched files use Prettier code style!" (after one format:fix pass)
pnpm test:coverage -> Test Files 68 passed (68) / Tests 681 passed (681)
                      Statements 88.44% / Branches 76.75% / Functions 90.57% / Lines 92.44%
                      (all above the 80/65/78/82 gate)
pnpm build       -> vite build succeeded, dist/ emitted
```

### Left for the orchestrator / flagged as design questions

- **Balance**: not run (`pnpm balance:run`/`python -m balance.cli check` deliberately not run by
  this agent per the brief). The group convenience's `'fine'` retarget and the new
  turbo/supercharger-on-NA install path are both real economy-shaped changes worth a balance pass.
- **"Repair all to fine" interpretation**: flagged above - implemented literally per the locked
  decision-1 wording; revert to `'mint'` in `CarDetailScreen.vue`'s `GROUP_REPAIR_TARGET_BAND` if
  that reading is wrong.
- **Test-isolation risk in other files**: flagged above; no other file touched, but worth a
  TODO.md entry if the maintainer wants a repo-wide `mount()`/`unmount()` audit tracked.
- User-only task (visual pass + price-tuning the already-existing new catalog entries) is
  unstarted, as expected - it's explicitly not Claude-implementable.
