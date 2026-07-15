# Sprint 70 - Parts provenance, ground up

**Source:** maintainer directive 2026-07-15 (recorded verbatim in `TODO.md`, "Next up"); scoping
delegated to Claude 2026-07-15 ("you can do all of the scoping yourself"). Design context:
`docs/design/component-hierarchy-spec.md` (which depends on this sprint).

**For the implementing agent:** every symbol below was verified against the codebase on
2026-07-15. If a cited symbol is missing or has moved, STOP and re-locate it before editing; do
not improvise a substitute. No em dashes anywhere. All player-facing copy in British English.

## Confirmed current state (code discovery, 2026-07-15)

- `PartInstance` (`packages/content/src/part.ts:76-92`): `{ id, partId, band, genuinePeriod,
  customerJobId?, pricePaidYen? }`. No origin of any kind.
- Four birth sites construct a `PartInstance`: `stockInstanceFor` (`packages/sim/src/auctions.ts:255`),
  the removal-backfill stock instance in `resolveRemovePart` (`packages/sim/src/jobs.ts:320-327`),
  `resolveBuyPart` (`packages/sim/src/parts.ts:134`), `resolvePartDeliveries`
  (`packages/sim/src/parts.ts:196`).
- Ownership is inferred via `customerJobId`, read/written at: `jobs.ts:364` (write on removal),
  `jobs.ts:596,598` (`installFitGate`), `parts.ts:245` (`resolveScrapPart` refusal),
  `serviceJobs.ts:988,999` (close-out), `gameStore.ts:1611,1613` (UI gating),
  `PartCard.vue:72` (`isCustomerOwned`), `saveCodec.ts:1155` (old migration).
- `ServiceJob.baselineInstalledPartIds` serves two masters: ownership (Sprint 68) and install-task
  completion (`isServiceTaskDone`, `serviceJobs.ts:799`). This sprint retires the ownership
  master only; Sprint 72 retires the completion master and deletes the field.
- Inventory: `GameState.partInventory: PartInstance[]` (`packages/content/src/gameState.ts:115`).
- `PROVENANCE_POOL` (car history flavour lines) lives in code at `auctions.ts:41-57`, violating
  the content law (open `TODO.md` engineering item).
- `SAVE_VERSION` is `30` (`packages/game/src/save/saveCodec.ts:416`). Directive 19: schema change
  = version bump only; no migration, no golden-save test, no legacy-compat branch.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- The four birth sites: origin is stamped where parts are already born; no new creation path.
- `PartCard.vue`: gains one origin line; no new component.
- The content pipeline (Sprint 53 `partPricing` precedent) for `provenance.json`.
- Zod defaults in `decodeSave` for additive schema fields.

**New mechanisms:**

1. An immutable `origin` record on `PartInstance`, set at birth, never rewritten.
2. `packages/sim/src/provenance.ts`: the single module every ownership question goes through.
3. `packages/content/data/provenance.json` (the relocated car-history flavour pool).

## Decisions

1. **Origin shape.** `PartOrigin` is a Zod discriminated union on `kind`:
   `{ kind: 'car', carInstanceId: string, carLabel: string, day: number }` or
   `{ kind: 'market', day: number }`. `carLabel` is denormalised at birth
   (`"'95 " + resolveCarDisplayName(model)` style, using the model's display name and the
   instance year) so the label survives the donor car being sold or scrapped. `origin` is
   REQUIRED on the schema; it is immutable and no code path may rewrite it.
2. **`customerJobId` is deleted from the schema**, not deprecated. Every reader listed above is
   reimplemented over `provenance.ts`. Directive 19 makes this free: bump `SAVE_VERSION` to 31,
   no migration. Old saves break; that is accepted and intended.
3. **The ownership question has one answer.** `isCustomerOriginPart(part, job)` returns
   `part.origin.kind === 'car' && part.origin.carInstanceId === job.car.id`. `installFitGate`,
   `resolveScrapPart`, close-out, and the UI all call it; none re-derives ownership locally.
4. **Behaviour parity this sprint.** Sprint 70 changes the MECHANISM, not the rules: what was
   allowed/refused before is allowed/refused after (the Sprint 68 post-fix rules are the
   baseline). The outcome-based rework of the rules themselves is Sprint 72.
5. **`PROVENANCE_POOL` moves to content** as `provenance.json` (rides along; clears the open
   `TODO.md` engineering item). Same strings, same `(ageBand, upkeepTier)` keying.
6. **Generation-day origin.** Parts born during car generation carry the generation day
   (`day` param of `generateAuctionCatalog`); parts born from purchases carry `state.day`.

## Tasks

**Claude:**

1. `packages/content/src/part.ts`: add `PartOriginSchema` (discriminated union per decision 1)
   and the required `origin` field on `PartInstanceSchema`; delete `customerJobId`. Export the
   `PartOrigin` type from `packages/content/src/index.ts`.
2. `packages/sim/src/provenance.ts` (new): `makeCarOrigin(carInstanceId, carLabel, day)`,
   `makeMarketOrigin(day)`, `isCustomerOriginPart(part, job)`, `partsOriginatingFromCar(parts,
   carInstanceId)`, `describeOrigin(origin): string` (the UI line: `Pulled from <carLabel>` /
   `Bought day <n>`; used later by teardown too, so keep it here).
3. Stamp origin at all four birth sites. `stockInstanceFor` (`auctions.ts:255`) gains
   `origin: PartOrigin` as a parameter; `generateAuctionCarInstance` builds the car origin once
   (it already has `id`, `model`, and the roll year) and passes it down. The `jobs.ts:320`
   backfill instance uses the origin of the car it materialises on. `parts.ts:134` and
   `parts.ts:196` use `makeMarketOrigin(state.day)`.
4. Reimplement every `customerJobId` reader over `provenance.ts`: `jobs.ts:596,598`,
   `parts.ts:245`, `serviceJobs.ts:988,999`, `gameStore.ts:1611,1613`, `PartCard.vue:72`.
   Delete the write at `jobs.ts:364`. Delete the dead read in the old migration path if the
   compiler flags it; otherwise leave historical migrations untouched.
5. Move `PROVENANCE_POOL` to `packages/content/data/provenance.json` with schema
   `packages/content/src/provenance.ts` (record keyed `ageBand` then `upkeepTier`, values
   `string[]` min 2), export via `data.ts` and `index.ts`, add to `SimContext`
   (`packages/sim/src/context.ts:39-77` and `buildSimContext` at `context.ts:143`) and to the
   store's `buildSimContext` call (`gameStore.ts:707-721`). `auctions.ts:408` reads it from
   context. Add the per-cell min-2-lines assertion to `packages/content/tests/schemas.test.ts`.
6. `PartCard.vue`: render `describeOrigin(instance.origin)` as a dim caption line under the part
   name. British spelling; no decorative Unicode.
7. Bump `SAVE_VERSION` to 31 (`saveCodec.ts:416`). No migration entry (directive 19). Confirm
   `decodeSave` fails cleanly (Zod error -> new game path) on a v30 save rather than crashing.
8. Tests (directive 17 applies: update tests that assert the OLD mechanism to assert the same
   RULES via the new mechanism; state which case each edit was in the Exit):
   - One unit test per birth site asserting the stamped origin (new file
     `packages/sim/tests/provenance.test.ts`).
   - Close-out parity: fit a bought part to a customer car, pull it back off, close out: the
     player keeps it. Pull the customer's engine on any job: refused/returned exactly as the
     Sprint 68 post-fix behaviour.
   - Codec roundtrip: `encodeSave`/`decodeSave` preserves `origin` exactly.
   - Golden-master hashes in `advanceDay.test.ts` will change (new field in state): re-pin with
     a comment naming this sprint.
9. Run the full gate: `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test:coverage`,
   `pnpm build`. Show output. Fill the Exit.

**User-only (maintainer):**

- None. (Sprint approval and commit sign-off as usual.)

## Definition of done

- Every `PartInstance` in a new game carries an immutable `origin`; all four birth sites stamp
  it; a part in inventory can answer "where did this come from" exactly, in the UI.
- `customerJobId` no longer exists in schema or code; every ownership question routes through
  `provenance.ts`; behaviour parity with Sprint 68's post-fix rules is test-asserted.
- `PROVENANCE_POOL` lives in `packages/content` with schema + content test; the `TODO.md` entry
  for it is removed.
- `SAVE_VERSION` is 31 with no migration; full gate green; golden hashes re-pinned with comment.

## Exit

Implemented and verified. Full gate green: typecheck/lint/format clean, **1175 tests** passing
(coverage thresholds all cleared: statements 91.14%, branches 81.18%, functions 92.78%, lines
94.8%), production build succeeds.

### What was built

`PartOriginSchema` (a discriminated union on `kind`, `packages/content/src/part.ts`) is a required,
immutable field on `PartInstanceSchema`; `customerJobId` is deleted from the schema entirely.
`packages/sim/src/provenance.ts` is the single module every ownership question now routes through:
`makeCarOrigin`/`makeMarketOrigin` (construction), `isCustomerOriginPart` (the one-part-vs-one-job
predicate), `partsOriginatingFromCar` (the close-out reconciliation basis), `describeOrigin` (the
UI line). All four birth sites stamp it: `stockInstanceFor` (auctions.ts) gained a required
`origin` parameter; `generateAuctionCarInstance` builds one car origin once (via a new small
`carOriginLabel(model, year)` helper implementing decision 1's `"'95 Corolla"` format) and threads
it through every part on that car; `resolveRemovePart`'s backfill instance (jobs.ts) stamps the
origin of the car it materialises on; `resolveBuyPart`/`resolvePartDeliveries` (parts.ts) stamp
market origin at `state.day`.

Every `customerJobId` reader is reimplemented over `provenance.ts`: `installFitGate`'s not-your-part
gate (jobs.ts), `resolveScrapPart`'s ownership lock (parts.ts), `resolveServiceJob`'s close-out
reconciliation (serviceJobs.ts, now keyed by the job's car id via `partsOriginatingFromCar` rather
than a job id), `gameStore.ts`'s `isPartAvailableFor`, and `PartCard.vue`'s customer-owned badge/
scrap-lock (via two new store methods, `isCustomerOwnedPart`/`describePartOrigin` - the component
itself has no direct state access, so the store is where the origin lookup against
`activeServiceJobs` has to live). The write at `jobs.ts:364` (the old tag-stamping branch in
`resolveRemovePart`) is deleted outright, along with the now-dead `isCustomersOwnPart` helper.
`resolveRemovePart` is now a pure passthrough for ownership: it never decides whose part something
is, only carries whatever origin the instance was already born with.

`PROVENANCE_POOL` (car-history flavour lines) moved to `packages/content/data/provenance.json` with
a schema (`packages/content/src/provenance.ts`, `AgeBandSchema`/`UpkeepTierSchema`/
`ProvenancePoolSchema`), wired through `data.ts`/`index.ts`, added to `SimContext` and
`buildSimContext` as a 12th trailing-defaulted parameter (every existing call site, including
`gameStore.ts`'s, needed no change at all - the same "trailing default" convention `specialtyCopy`/
`techniques` already established), and a content test asserting every `(ageBand, upkeepTier)` cell
carries at least 2 lines. `auctions.ts` reads it from `context.provenancePool` instead of a local
constant; `AgeBand`/`UpkeepTier` are content types now, not locally-declared ones.

`PartCard.vue` renders `describeOrigin(instance.origin)` as a dim caption line under the part name.
`SAVE_VERSION` is 31 (no `MIGRATIONS[30]` entry, per directive 19); `decodeSave` fails cleanly on a
pre-v31 save (a `ZodError` the schema throws, caught by every real caller - `hydrate`/
`importSaveCode` - falling back to a new game), confirmed by a dedicated test.

### Deviations from the literal task list, with reasoning

1. **`stockInstanceFor`'s required `origin` parameter cascaded to every one of its callers, not
   only the two the doc named.** The "four birth sites" in the Confirmed-current-state section
   count `stockInstanceFor` itself as one site regardless of how many places call it - so once it
   required `origin`, `enforceMaxBillFraction`'s missing-slot softening pass, `serviceJobs.ts`'s
   `forceTasksOutstanding` (the "force genuinely outstanding" repair-task replacement), and
   `coherence.ts`'s two synthetic worst-case probe cars all needed an origin threaded in too - none
   of these are new mechanisms, they're the same generation-time origin the car around them already
   carries (or, for `coherence.ts`'s synthetic cars, a throwaway origin scoped to that probe's own
   fake id, since those cars are never real save data). `generateAuctionCarInstance` and
   `forceTasksOutstanding` both gained a trailing, defaulted `day` parameter for this (unchanged
   default for every existing test caller); `enforceMaxBillFraction` gained a required `origin`
   parameter (both its callers - real generation and `coherence.ts` - already have one to pass).
2. **The historical save-migration test suite in `saveCodec.test.ts` required a significant,
   deliberate cut - the largest judgement call in this sprint.** `PartInstanceSchema`'s `origin`
   field has no migration (directive 19, decision 2: "old saves break; that is accepted and
   intended"). That is not a per-version-bump technicality - it means the FULL migration chain,
   for a save of ANY prior version, can never again reach final schema validation, because no
   `MIGRATIONS[n]` step backfills `origin` and none may (adding one would be exactly the "make an
   old save work again" migration directive 19 forbids). Concretely, this broke every test that
   decoded a real pre-Sprint-26 (`components`/`conditionPercent`-shaped) car all the way through
   `decodeSave` to final validation - regardless of which specific historical step was nominally
   under test, since `migratePartInstance`/`migrateCarInstanceToBands` (the v15 -> v16 step) and
   `migratePartSlotToStock` (the v20 -> v21 step) synthesize fresh `PartInstance`s that predate
   `origin` and were deliberately left untouched, per the doc's own "leave historical migrations
   untouched" instruction. Two describe blocks (v15 -> v16's 8 tests sharing one fixture; v20 ->
   v21's 5 old-shape tests) tested exactly that impossible scenario and were retired, each replaced
   by one test confirming decode now fails cleanly for that shape (directive-17 case (a): decision 2
   makes "decodes cleanly" the wrong assertion, not a stale detail of a right one). Five further
   tests (pre-v9, pre-v11, pre-v12, pre-v14, pre-v15) constructed a car using the same dead
   `components` shape purely as incidental fixture data for an UNRELATED concern (bay/parking array
   reconstruction, auction-bid-state reconstruction, `hiddenIssues` dropping, service-job-arrival
   defaulting) - these were rewritten to build their car via `mintParts()` (the modern, origin-
   carrying shape already used by the v17 -> v19 blocks for the identical reason), keeping every one
   of their real assertions intact. `v20 -> v21`'s "round-trips a current v21 state" test needed no
   change - it already used modern shape. The `v21 -> v22` "customer-owned tagged part round-trips"
   tests are separately replaced (see below) since they tested the deleted `customerJobId` mechanism
   directly, not an old-shape decode.
3. **`gameStore.ts` gained two new exposed methods, `isCustomerOwnedPart`/`describePartOrigin`,
   beyond what task 4 named.** `PartCard.vue` needed a way to ask "is this instance customer-owned"
   and "what does its origin read as" without touching `gameState.activeServiceJobs` directly (it
   never has - it only ever receives `instance`/`part` as props); the store is the one place with
   both the game state and the sim's `provenance.ts` functions in scope, matching the existing
   `isPartRepairable`/`carPartLabel` pattern for every other PartCard-facing derived fact.

### Tests (directive 17 applied throughout)

New: `packages/sim/tests/provenance.test.ts` (13 tests - the primitives, one per birth site, and
two close-out-parity integration tests: a bought-and-fitted part surviving close-out, a customer's
own part reconciling out). `packages/content/tests/schemas.test.ts` gained the provenance min-2-
lines content test. `saveCodec.test.ts` gained a pre-v31-fails-to-decode test and a v31-round-trips-
origin test.

Every pre-existing test touched is **case (a)**: the mechanism changed (a mutable `customerJobId`
tag, decided by inference, replaced by an immutable `origin` fact decided at birth), but the RULES
it protects are unchanged - a player-bought part fitted to a customer's car and pulled back off
still stays theirs; the customer's own part still reconciles out at close-out; a customer-owned
part still can't be scrapped, sold, or installed onto a different car. Reimplemented (not merely
re-asserted) in: `jobs.test.ts` (the "whose part is it" describe block collapsed to two tests, since
`resolveRemovePart` no longer makes an ownership decision to test - the real enforcement moved
entirely to `installFitGate`, already covered by the "refuses...onto a DIFFERENT car" test one
level up, reworked to build the tagged instance's origin instead of a tag), `parts.test.ts`
(`resolveScrapPart`'s lock, now needs a real active service job to key off), `serviceJobs.test.ts`
(close-out reconciliation, now keyed by car id), `gameStore.garage.test.ts` and `PartCard.test.ts`
(both needed a real `activeServiceJobs` entry in state, since origin is checked against live jobs,
not a prop-level tag). `saveCodec.test.ts`'s dedicated `customerJobId`-tag round-trip tests are
replaced by the pre-v31/v31 tests above (same case (a): the tag they round-tripped no longer
exists). Every other touched file (`CarDetailScreen.test.ts`, `derivedStats.test.ts`,
`marketValue.test.ts`, `stagedWork.test.ts`, `valueModelProbes.test.ts`, `bots/investor.test.ts`,
`advanceDay.test.ts`, `facilitiesInAdvanceDay.test.ts`, `gameState.test.ts`, `testFixtures.ts`) only
needed a schema-valid `origin` filler added to existing `PartInstance` literals - no behaviour
assertion changed, so directive 17 doesn't apply to those.

Golden-master hashes in `advanceDay.test.ts` re-pinned (both the 30-day career and the acquisition-
and-sale career): `origin` is a new field in every hashed `GameState`, not a logic change - every
other assertion in the file, and the whole `generationCoherence`/`valueModelProbes` suite, passes
unchanged, confirming the RNG draw sequence itself never moved.

### Not done

Nothing from the task list is deferred. `pnpm balance:run` was not re-run - this sprint added no
RNG draws and changed no economy/content tuning (confirmed by every existing generation/valuation
test passing unchanged), so there is no fresh economic signal for it to capture.
