# Sprint 12 — Component model refactor (zones+slots -> unified components)

*Source: `TODO.md`'s agreed 10 -> 11 -> 12 -> 13 -> 14 sequencing, and
`docs/design/repair-replace-progression.md`'s "Option B" model (committed 2026-07-09), which the doc
itself splits into "14a" (this sprint: the component-model consolidation alone) and "14b" (Sprint 13: the equipment/
repair-vs-replace economy built on top). Status: **implemented, ready for review.** Two decisions were
revised mid-flow at the maintainer's explicit direction before implementation began: no save migration
(decision 3 — "nuke," no existing saves to preserve) and correlated per-car condition rolls instead of
independent per-component rolls (decision 5 — "components need to have a relationship"). Both are
reflected in the decisions below and in what actually shipped.

## Goal

Today a car's condition lives in two disconnected places: a 5-entry `condition` zone map
(engine/drivetrain/suspension/body/interior) and a 7-entry `buildSheet` slot map
(engine/forcedInduction/drivetrain/suspension/brakes/bodyAero/wheelsInterior) — different key sets,
no shared identity, and two components (`wheelsInterior`) that don't even map onto a single real part
of the car. Sprint 13's repair-vs-replace economy needs one thing per real car component: a condition
number and (optionally) an installed part. This sprint does *only* that consolidation — collapsing
both maps into one 8-key `components` structure — and carries every existing mechanic (jobs, auctions,
service jobs, valuation, selling, the UI) across the seam without changing what any of them do. No
equipment, no gated repair, no new player-facing mechanic: this is purely the schema/logic
consolidation the design doc calls out, quarantined to its own sprint so Sprint 13 can build on solid
ground instead of restructuring and adding economy at once. **No save migration**: the maintainer has
confirmed there are no existing saves worth preserving, so this sprint bumps `SAVE_VERSION` and moves
on — no transform step, no backward-compat testing (decision 3). While touching condition generation
for the 8-component expansion, this sprint also fixes a realism gap the old 5-zone roll already had:
component conditions are correlated to a per-car baseline instead of independently random (decision 5)
— a car that rolls a rough engine should generally roll a rough everything-else, not a lottery per
component.

## Reuse analysis (directive 15 — read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Job/labor core | `createJob`, `applyLaborToJob`, `isJobComplete`, `completeJob`, `findOrCreateJob`, `applyAvailableLaborToJob`, `resolveJobLabor` (`jobs.ts`) | **Untouched in shape.** Only the field they read to identify a target (`zone`/`slot`) collapses into one `componentId` field — same functions, same call sites, same instant-resolution behavior from Sprint 11. |
| Instant-action pattern | The store-calls-a-pure-resolver template (Sprint 08/09/11) | **Untouched.** `repair`/`install` stay instant; their signatures just take `componentId` instead of `zone`/`slot`. |
| Auction generation + lemon rule | `generateAuctionCarInstance`, `resolveHandoverCondition`, `groupHiddenIssuesByZone` (`auctions.ts`) | **Same algorithm, wider key set.** The condition roll and severity-application logic don't change — they just iterate 8 components instead of 5 zones. |
| Service-job type + flavor-pool catalog | `ServiceJobTypeSchema`/`generateServiceJobOffers` (Sprint 11) | **Structurally untouched.** Only `ServiceJobWorkSchema`'s `zone`/`slot` fields collapse into `componentId` — the type/flavor-pool composition itself doesn't change. |
| Stat formulas | `computeDerivedStats` (`derivedStats.ts`) | **Math untouched.** Only the input shape changes (one loop over `components` instead of separate condition reads + a slot loop) — see decision 4 for exactly which components feed which formula, unchanged from today. |
| Save version bump + existing decode-failure fallback | `SAVE_VERSION` bump (`saveCodec.ts`) + `hydrate()`/`importSaveCode()`'s existing try/catch-and-reset-to-a-fresh-game behavior (`gameStore.ts`) | **Reused, not extended.** No `MIGRATIONS` entry is added this sprint (decision 3, "nuke") — a pre-v5 save's `CarInstance` no longer matches the schema, so `decodeSave`'s final `GameStateSchema.parse` throws, and the store's *already-existing* catch-all fallback (start a fresh career) handles it. No new fallback code needed. |
| Content law | Zod schemas + JSON under `packages/content` | **Reused, no new pattern.** `ComponentIdSchema` and the new `components` shape are authored the same way `ZoneSchema`/`ConditionSchema`/`BuildSheetSchema` were. |
| Buyer valuation / selling | `valuateCarForBuyer`, `auctionBidValueFor`, `sellViaWalkIn`, `listPubliclyAskingPrice` (`valuation.ts`/`selling.ts`) | **Fully untouched.** Confirmed by reading both files: neither references `condition`/`buildSheet`/`zone`/`slot` directly — they only call `computeDerivedStats`, which already absorbs the whole change. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **The unified `ComponentIdSchema` + per-component `{condition, installed}` shape.** No existing
   type covers "one entity with both a condition and an optional installed part" — `ConditionSchema`
   and `BuildSheetSchema` are separate today specifically because nothing needed them joined until
   Sprint 13's repair-vs-replace economy (repair acts on condition, replace acts on installed, both
   need to agree on what a "component" is).
2. **Correlated per-car condition rolls.** Today's `generateAuctionCarInstance` rolls each zone's
   condition independently (`rng.int(30, 90)` called 5 separate times) — nothing ties them together, so
   a car can roll a pristine engine and a wrecked transmission with no narrative sense. A shared
   per-car baseline + bounded per-component jitter (decision 5) is a new roll shape, not a wider
   application of the old one.
3. **The `wheelsInterior` -> `wheels`/`interior` content split.** No existing mapping says which of
   `wheelsInterior`'s 3 parts is a wheel vs. an interior part — this sprint hand-categorizes it once
   (decision 3) as new one-time content work, not a reusable mechanism.

## Definition of Done

- `CarInstance` has one `components: Record<ComponentId, {condition, installed}>`-shaped field (8
  keys: engine, forcedInduction, drivetrain, suspension, brakes, wheels, body, interior) — the old
  `condition`/`buildSheet` fields are gone, not deprecated-and-kept.
- `ZoneSchema`/`SlotSchema` are deleted; every touchpoint (`Part`, `HiddenIssue`, `CarModel`'s
  `hiddenIssueWeights`, `ServiceJobWork`, `NewJobSpec`/`Job`) uses `ComponentIdSchema` instead.
- Every ripple site the design doc calls out is updated and tests pass: `CarInstanceSchema`,
  `computeDerivedStats`, `resolveHandoverCondition`, auction + service-job car generation, all five
  harness bots + the service-grinder bot, both `advanceDay.test.ts` golden masters (re-pinned), the
  car-detail UI, and `ServiceJob`'s work field.
- Stat formulas produce **identical output** for any car that only uses the 4 components that already
  fed stats before this sprint (engine/suspension/body/drivetrain) — this is a refactor, not a balance
  change (decision 4 makes this an explicit, tested guarantee).
- `SAVE_VERSION` 4 -> 5, no `MIGRATIONS[4]` transform (decision 3 — no existing saves to preserve); a
  test confirms a pre-v5 save code now fails `decodeSave` cleanly and the store's existing fallback
  starts a fresh career rather than crashing.
- Auction and service-job car generation rolls correlated component conditions (decision 5) — a
  statistical regression confirms components on the same car cluster around a shared baseline rather
  than varying fully independently.
- All checks green (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`); no `Zone`/`Slot` type or
  `.condition[` / `.buildSheet[` access remains anywhere in the repo (verified by grep, not just
  typecheck, since a few of these reads are on loosely-typed content JSON).

## Decisions (approve / adjust before implementation)

1. **`ComponentIdSchema` replaces `ZoneSchema`/`SlotSchema` outright — no back-compat aliasing.**
   This is explicitly a big-bang migration sprint (the design doc's own framing), not an incremental
   one; keeping the old types around "just in case" would leave two competing vocabularies for the
   same thing, which is exactly the split this sprint exists to remove. 8 values: `engine`,
   `forcedInduction`, `drivetrain`, `suspension`, `brakes`, `wheels`, `body`, `interior`.

2. **The new `components` field keeps today's flat-object style, not a true `z.record`.** Same reason
   `ConditionSchema`/`BuildSheetSchema` are flat objects today: this codebase's `noUncheckedIndexedAccess`
   makes every `Record` access come back possibly-`undefined`, forcing null-checks at every read site
   for a key set that's actually fixed and known. `components: { engine: ComponentSchema, ... }` (8
   named keys), where `ComponentSchema = { condition: number 0-100, installed: PartInstance | null }`.

3. **No save migration — nuke, per explicit maintainer instruction.** There are no existing saves
   worth preserving, so this sprint does not write a `MIGRATIONS[4]` transform. `SAVE_VERSION` still
   bumps 4 -> 5 (a real `GameState`-nested shape change, per the save law's letter), but a pre-v5 save
   code simply fails to decode under the new `CarInstanceSchema` — `decodeSave`'s final
   `GameStateSchema.parse` throws, which `hydrate()`/`importSaveCode()` already catch and handle by
   starting a fresh career. That existing fallback is sufficient; nothing new needs to be built for it,
   only tested (see Task D). The old zone/slot -> component mapping (engine/drivetrain/suspension/body
   direct; forcedInduction/brakes/wheels newly-introduced) still matters for one thing: the
   `wheelsInterior` -> `wheels`/`interior` *content* split below, which is about `parts.json` going
   forward, not about transforming save data.

   **Content reclassification (`parts.json`, decision 1 of Task A):** today's `wheelsInterior` slot
   has exactly 3 parts — `enkai-mesh-15` and `vulk-ve37` are wheels, `zashiki-bucket-seat` is a seat.
   Going forward their `componentId` becomes `wheels`, `wheels`, and `interior` respectively (not a
   guess: unambiguous from the part names). This is narrower than the design doc's own summary (which
   assumed `interior` ends up with no installed part at all) — that assumption didn't account for the
   bucket seat's real classification.

4. **The 3 brand-new condition fields (brakes/wheels/forcedInduction) stay inert on stat formulas
   this sprint.** Confirmed by reading `derivedStats.ts`: today, only `engine` (power, reliability),
   `suspension` (handling), `body` (style), and `drivetrain` (reliability) condition values feed any
   formula — `interior` condition already feeds nothing, and `brakes`/`wheelsInterior`/
   `forcedInduction` have never had a condition-to-stat pathway at all (only their *installed part's*
   own `statModifiers`, wear-scaled, counted). Wiring the 3 new condition fields into stats now would
   be a disguised balance change smuggled into a refactor. They exist, they're tracked, they're
   readable — nothing consumes them for stats until Sprint 13 gives repair-vs-replace on those
   components real stakes.

5. **Condition rolls become correlated to a per-car baseline, for all 8 components — fixing a realism
   gap that existed even in today's 5-zone version.** Independently rolling each component
   (`rng.int(30, 90)` called separately per zone) lets a car roll a pristine engine and a wrecked
   transmission with no relationship between them, which reads as arbitrary rather than "this car has
   had a hard life" or "this one's been babied." New shape: roll one baseline per car,
   `rng.int(CAR_CONDITION_BASE_MIN, CAR_CONDITION_BASE_MAX)` (keeping today's 30-90 range), then each of
   the 8 components rolls `clamp(baseline + rng.int(-CAR_CONDITION_JITTER, CAR_CONDITION_JITTER), 0, 100)`
   — `CAR_CONDITION_JITTER` a new constant (a spread, e.g. +/-15) around that shared baseline. A car is
   still individually variable component-to-component, but no longer able to roll a 100 and a 1 side by
   side. Both new constants live in `sim/constants.ts`, next to the existing tuning knobs
   (`AUCTION_BIDDER_DISCIPLINE`, `AUCTION_FIELD_BASE`, etc.) — same practice, not a new pattern. Applies
   uniformly to all 8 components (not just the 3 new ones) since the correlation gap is real for the
   original 5 too, and `generateAuctionCarInstance` is being touched for the expansion regardless.
   Feeds both auction-lot generation and service-job customer-car generation (both call the same
   function).

6. **`HiddenIssue.zone` and `CarModel.hiddenIssueWeights[].zone` rename to `componentId` — schema
   widens to all 8 values, but no new content is authored for brakes/wheels/forcedInduction this
   sprint.** Existing hidden-issue data keeps targeting only the original 5 components; adding hidden
   issues for the 3 new ones is optional future content work, not required for this migration to be
   complete or correct.

7. **`ServiceJobWorkSchema`'s `repair`/`install` variants both take a single `componentId:
   ComponentIdSchema` field, dropping `zone`/`slot`.** Matches the design doc's own note ("Sprint 08's
   `ServiceJob.requiredSlot` becomes a `ComponentId`") and keeps the discriminated union's two variants
   symmetric instead of one still saying `zone` and the other `slot` for what's now the same concept.

8. **`NewJobSpec`/`Job` collapse `zone?`/`slot?` into one `componentId: ComponentIdSchema` field.**
   `jobIdFor` (the stable per-car-per-target job id) keys off `componentId` instead of "zone or slot,
   whichever is set" — removes a branch, not just a rename.

## Task breakdown

### A. Content (`packages/content`)

- [x] `tags.ts`: add `ComponentIdSchema` (8 values, decision 1); delete `ZoneSchema`/`SlotSchema` and
  their `Zone`/`Slot` type exports.
- [x] `carInstance.ts`: replace `condition: ConditionSchema` + `buildSheet: BuildSheetSchema` with
  `components: ComponentsSchema` (decision 2, one `ComponentSchema = {condition, installed}` entry per
  of the 8 ids).
- [x] `part.ts`: `PartSchema.slot: SlotSchema` -> `componentId: ComponentIdSchema`.
- [x] `hiddenIssue.ts`: `HiddenIssueSchema.zone` -> `componentId` (decision 6).
- [x] `carModel.ts`: `HiddenIssueWeightSchema.zone` -> `componentId` (decision 6).
- [x] `serviceJob.ts`: `ServiceJobWorkSchema`'s two variants both take `componentId` (decision 7).
- [x] `data/parts.json`: rename every part's `slot` field to `componentId`; reclassify the 3
  `wheelsInterior` parts per decision 3 (`enkai-mesh-15`, `vulk-ve37` -> `wheels`;
  `zashiki-bucket-seat` -> `interior`); the 3 `bodyAero` parts become `body`.
- [x] `data/cars.json`: rename every `hiddenIssueWeights[].zone` to `componentId` (values unchanged —
  all 5 existing entries stay within engine/drivetrain/suspension/body/interior, decision 6).
- [x] `data/hiddenIssues.json`: rename `zone` to `componentId` (values unchanged).
- [x] `data/serviceJobs.json`: rename each type's `work.zone`/`work.slot` to `work.componentId`.
  Went one step further than a pure rename: the old `install-wheels-interior` type's own flavor pool
  mixed wheels-themed and interior-themed lines under one `slot: 'wheelsInterior'` — exactly the
  flavor/work mismatch class Sprint 11 built the type+pool model to prevent, now surfaced by giving
  wheels and interior real, separate identities. Split into `install-wheels` and `install-interior`,
  each with its own on-theme flavor pool (13 types total, up from 12).
- [x] `index.ts`: drop `Zone`/`Slot` exports, add `ComponentId`/`ComponentIdSchema`.

### B. Sim (`packages/sim`)

- [x] `derivedStats.ts`: replace the 7-entry `SLOTS` loop with an 8-entry `COMPONENT_IDS` loop reading
  `instance.components[id].installed`; condition inputs to `power`/`handling`/`style`/`reliability`
  stay scoped to `components.engine`/`suspension`/`body`/`drivetrain` only (decision 4 — an explicit,
  tested no-op for the 3 new components).
- [x] `auctions.ts`: `generateAuctionCarInstance` rolls a per-car baseline + jittered condition for all
  8 components (decision 5, new `CAR_CONDITION_BASE_MIN`/`MAX`/`CAR_CONDITION_JITTER` constants in
  `constants.ts`); `groupHiddenIssuesByZone` -> `groupHiddenIssuesByComponent`; `applyIssueSeverity`/
  `resolveHandoverCondition` operate on `components[id].condition`.
- [x] `jobs.ts`: `createJob`/`applyJobToCar`/`jobIdFor` use `componentId` (decision 8); repair branch
  sets `components[componentId].condition = 100`; install branch sets
  `components[componentId].installed`, occupied-check reads the same field.
- [x] `actions.ts`: `NewJobSpecSchema` drops `zone`/`slot`, adds `componentId: ComponentIdSchema`.
- [x] `serviceJobs.ts`: `isServiceWorkDone`/`installedPart` read `job.car.components[job.work.componentId]`.
- [x] `context.ts`: `hiddenIssuesByZone` field/type -> `hiddenIssuesByComponent`.
- [x] Bots (`randomStrategy.ts`, `balancedPlayer.ts`, `cautiousRestorer.ts`, `flipper.ts`,
  `serviceGrinder.ts`): every decision loop that iterated zones now iterates `componentId` instead,
  restricted to the same 5 stat-feeding components as before (`REPAIRABLE_COMPONENTS`, unchanged bot
  behavior) — bots don't spend labor repairing brakes/wheels/forcedInduction, since decision 4 keeps
  those inert this sprint and a rational bot wouldn't bother.
- [x] `advanceDay.test.ts`: rewrite the hand-built fixture's car literal to the `components` shape;
  re-pin both golden-master hashes (unavoidable — the `GameState` shape changes).

### C. Game (`packages/game`)

- [x] `gameStore.ts`: `repair(carId, componentId)` / `install(carId, componentId, partInstanceId)`
  (renamed params, same instant-resolution behavior); `installablePartsFor(carId, componentId)`;
  `LotDetail.revealedIssues[].zone` -> `componentId`.
- [x] `CarDetailScreen.vue`: collapse the separate "Condition" (5-zone list) and "Build sheet" (7-slot
  list) sections into one "Components" list (8 rows) — each row shows the condition bar + repair
  button (if `condition < 100`) and the installed part or an install picker (if empty and a fitting
  part exists), matching how `zoneBusy`/`slotBusy` already read `job.kind` — collapsed into one
  `componentBusy(componentId)` check against `job.componentId`.
- [x] `saveCodec.ts`: `SAVE_VERSION` 4 -> 5; update the version-history comment to record that this
  bump has **no** `MIGRATIONS[4]` entry (decision 3 — no existing saves to preserve) and document why
  that's a deliberate decision, not an oversight.

### D. Testing

- [x] Content: `job.test.ts`/`gameState.test.ts` updated for the new `CarInstanceSchema` shape.
  A separate `parts.json` round-trip check wasn't needed — `PARTS`/`PartsSchema` already validate
  every part's `componentId` against `ComponentIdSchema` at content-load time (`data.ts`), so an
  invalid value fails immediately, structurally, not just under a dedicated test.
- [x] Sim: `derivedStats.test.ts` updated + a new regression asserting brakes/wheels/forcedInduction
  condition changes produce **zero** stat delta (decision 4, the anti-smuggled-balance-change guard);
  `auctions.test.ts` updated for componentId-keyed lemon rule plus a new statistical regression
  confirming a car's 8 rolled component conditions cluster within `CAR_CONDITION_JITTER` of a shared
  baseline across many seeds (decision 5, the correlated-roll guarantee); `jobs.test.ts`,
  `serviceJobs.test.ts` updated for `componentId`; each bot's existing tests updated.
- [x] Save: the existing v1/v2/v3 golden-save tests turned out to still pass unmodified — those
  pinned fixtures never populate `ownedCars`, so they never exercised the `CarInstance` shape the
  nuke decision actually breaks. Added instead: a new test proving a *populated* pre-v5 save (a real
  car in the old `condition`/`buildSheet` shape) now fails `decodeSave` cleanly (`saveCodec.test.ts`),
  a matching `gameStore.save.test.ts` case proving `importSaveCode` turns that failure into a clean
  `{ok: false}` rather than a crash, and a new v5 round-trip test with a real car in the `components`
  shape (nothing previously exercised a populated car through the codec either).
- [x] Game: `CarDetailScreen.test.ts`, `gameStore.garage.test.ts`, `gameStore.jobs.test.ts` updated for
  `componentId`-based calls.
- [x] Repo-wide grep check (part of the "all checks green" DoD bullet, not a separate automated test):
  confirm no remaining `Zone`/`Slot` type references or `.condition[`/`.buildSheet[` access.

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies, no data-layer access (this is a pure
schema/logic refactor inside the existing sim/content/game packages).

**User-only:** play a fresh career (old saves are intentionally not carried forward — decision 3) —
confirm the car-detail Components list reads clearly with 8 rows instead of the old two-section layout,
that nothing *feels* different stat- or gameplay-wise (decision 4's guarantee, only real play confirms
it holds), and that rolled car condition now reads as coherent per-car wear rather than a per-component
lottery (decision 5).

## Exit

This sprint adds no new player-facing mechanic — the Components list will look almost identical to
today's two-section Condition/Build-sheet layout, just unified into one. That's the point: Sprint 13's
equipment and repair-vs-replace economy needs one consistent thing per car component to gate, and
building that economy directly on top of today's split zone/slot model would mean either duplicating
equipment-gating logic per shape or migrating mid-sprint 13 anyway. Doing the migration alone, now,
with its own tests and its own save-law entry, means Sprint 13 starts from solid ground. Equipment
catalog, purchase actions, and gated repair are explicitly out of scope here — that's all of Sprint 13.
