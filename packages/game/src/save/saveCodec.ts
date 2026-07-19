import {
  ALL_CAR_PART_IDS,
  CARS,
  ECONOMY,
  fitmentClassForTier,
  PARTS,
  GameStateSchema,
  type ComponentId,
  type GameState,
  type PartFitmentClass,
  type RarityTier,
} from '@midnight-garage/content'
import { bandForMigratedCondition } from '@midnight-garage/sim'

/**
 * Save schema version. The Save law (CLAUDE.md engineering law 4): every
 * change to the GameState shape bumps this, adds a `migrate` case if needed,
 * and updates the golden-save test in the same PR.
 *
 * - v1: first save (Sprint 07).
 * - v2 (Sprint 08): added `reputationPoints`, `serviceJobOffers`,
 *   `activeServiceJobs` to GameState. Purely additive with schema defaults, so
 *   a v1 save decodes under v2 with the new fields default-filled - no explicit
 *   `MIGRATIONS[1]` step is needed (the golden-save test pins that a v1 code
 *   still loads).
 * - v3 (Sprint 09): added `serviceBayCount`, `parkingBayCount`,
 *   `serviceBayCarIds` to GameState. Also purely additive with schema
 *   defaults (1 / 3 / [] - matching a fresh game's starting bays), so a v1 or
 *   v2 save decodes under v3 with no explicit `MIGRATIONS[2]` step needed.
 * - v4 (Sprint 11): added `laborSlotsSpentToday` to GameState (the live daily
 *   labor counter instant actions decrement, replacing the old client-only
 *   `pending`/commit-at-End-Day plan). Purely additive with a schema default
 *   of 0, so a pre-v4 save decodes under v4 with the field default-filled -
 *   correct, since that save's day genuinely hadn't spent any labor under a
 *   mechanic that didn't exist yet. A v4-or-later save always carries its
 *   real value, mid-day or not - no explicit `MIGRATIONS[3]` step needed.
 * - v5 (Sprint 12): `CarInstance`'s `condition`/`buildSheet` split collapsed
 *   into one unified `components` map (zones+slots -> components refactor).
 *   Deliberately **no `MIGRATIONS[4]` step** - the maintainer confirmed there
 *   are no existing saves worth preserving, so a pre-v5 save's `CarInstance`
 *   simply no longer matches the schema and `GameStateSchema.parse` below
 *   throws. That's intentional, not a gap: `hydrate()`/`importSaveCode()`
 *   (packages/game/src/stores/gameStore.ts) already catch a `decodeSave`
 *   failure and fall back to a fresh career, so nothing new needed building
 *   for it, only testing (saveCodec.test.ts confirms a pre-v5 code fails
 *   cleanly rather than crashing).
 * - v6 (Sprint 13): added `ownedEquipmentIds` to GameState (what REPAIR is
 *   gated on - the equipment/repair-vs-replace economy). Purely additive
 *   with a schema default of `[]`, so a pre-v6 save decodes under v6 with no
 *   equipment owned - correct, since equipment didn't exist as a concept
 *   yet. No explicit `MIGRATIONS[5]` step needed.
 * - v7 (Sprint 14): added `pendingPartOrders` and `cartPartIds` to GameState
 *   (standard-delivery orders in transit, and the persistent parts-market
 *   cart). Both purely additive with a schema default of `[]`, so a pre-v7
 *   save decodes under v7 with no orders in transit and an empty cart -
 *   correct, since neither concept existed yet. No explicit `MIGRATIONS[6]`
 *   step needed.
 * - v8 (Sprint 15): `PublicListing` (nested in `activeListings`) gained
 *   `reputationDeltaOnSale` - the quality/lemon reputation effect of a
 *   pending public-listing sale, captured at listing-creation time and
 *   applied when the listing resolves. Purely additive with a schema
 *   default of 0, so a pre-v8 save's already-pending listings resolve
 *   reputation-neutral - correct, since the rule didn't exist when they
 *   were created. No explicit `MIGRATIONS[7]` step needed.
 * - v9 (Sprint 17): `serviceBayCarIds` changed shape from a compact list of
 *   only-occupied car ids to a real, index-addressable array - one entry
 *   per physical bay, `null` for an empty one - the positional model
 *   drag-and-drop needs (dropping onto "service bay 3" now means bay 3, not
 *   wherever the array used to happen to render a car). A new sibling
 *   `parkingCarIds` field gets the same treatment; before v9 "parking" had
 *   no stored array at all - a car counted as parked purely by not
 *   appearing in `serviceBayCarIds`. **This is the first genuinely
 *   non-additive Save-law migration this codebase has needed** - every
 *   prior version bump was a brand-new field with a safe schema default,
 *   but a plain default-fill here would silently strand every real parked
 *   car: `parkingCarIds` defaulting to `[]` makes an old save's already-
 *   parked cars invisible to the new parking view even though they're
 *   still sitting in `ownedCars`/`activeServiceJobs`. `MIGRATIONS[8]`
 *   reconstructs both arrays instead: the old compact `serviceBayCarIds`
 *   packs into the first N service slots, and every shop car NOT in that
 *   old list (the same exclusion rule the pre-Sprint-17 `parkingView`
 *   itself used) packs into `parkingCarIds` - both padded with `null` up to
 *   their respective bay counts (or left un-padded/overflowing beyond count
 *   if a save's real occupancy somehow exceeds it, so a migration never
 *   silently drops a real car rather than erring on the side of keeping it
 *   visible).
 * - v10 (Sprint 18): added `stagedCarWork` - per-car repair/install work the
 *   player has staged but not yet confirmed (the parts-inventory + stage-
 *   then-confirm workflow). Purely additive with a schema default of `{}`,
 *   so a pre-v10 save decodes with nothing staged on any car - correct,
 *   since the concept didn't exist yet. No explicit `MIGRATIONS[9]` step
 *   needed (back to the normal additive case after v9's one-off migration).
 * - v11 (Sprint 19): `AuctionLot` (nested in `activeAuctionLots`) gained
 *   `playerMaxBidYen` and `rivalEscalatedBidsYen` - the multi-day bidding
 *   rework's live standings, replacing same-day instant bid resolution.
 *   Both purely additive with schema defaults (`null` / `[]`), so a pre-v11
 *   save's already-listed lots decode with no bid in progress and no
 *   escalation yet - correct, since a v10-or-earlier save could never have
 *   had a bid mid-flight (bidding always resolved the instant it was
 *   placed). No explicit `MIGRATIONS[10]` step needed.
 * - v12 (Sprint 20, auction rework II): `AuctionLot` swaps its whole bid-state
 *   shape - `playerMaxBidYen`/`rivalEscalatedBidsYen` (sealed player max +
 *   hidden per-rival escalation) replaced by `currentBidYen`/`leadingBidder`/
 *   `quietDays`/`playerHasBid` (open, visible bidding). Not a plain
 *   default-fill: a v11 lot with a real bid in flight would otherwise decode
 *   with `currentBidYen: 0` and lose its standing entirely. `MIGRATIONS[11]`
 *   (`migrateV11ToV12`) reconstructs the new shape instead: `currentBidYen =
 *   max(playerMaxBidYen ?? 0, ...rivalEscalatedBidsYen)`, `leadingBidder` is
 *   whichever side held that max (`'player'` on an exact tie - consistent
 *   with the new ties-go-to-player hammer rule; `null` if the max is 0, i.e.
 *   nobody had bid), `quietDays` resets to 0 (a fresh count under the new
 *   activity-based-closing rule), and `playerHasBid = playerMaxBidYen !==
 *   null`. The old fields are left in place on the migrated object rather
 *   than explicitly deleted - `GameStateSchema.parse` strips any key the
 *   schema no longer declares, the same as every other migration here.
 * - v13 (Sprint 21, value model): added `marketLedger` to GameState - the
 *   two supply/demand counters (`lotSupply`/`playerSales`) the reworked
 *   weekly market-heat update reads. Purely additive with a schema default
 *   of `{ lotSupply: {}, playerSales: {} }`, so a pre-v13 save decodes with
 *   both counters empty - correct, since the concept didn't exist yet and a
 *   fresh pair of empty counters behaves exactly like a brand-new career's.
 *   No explicit `MIGRATIONS[12]` step needed.
 * - v14 (Sprint 22, hidden issues): every `CarInstance.hiddenIssues[]` entry
 *   gains `severityPercent`/`repaired`. Not a plain default-fill:
 *   `MIGRATIONS` are pure structural transforms with no content-catalog
 *   access, so there's no way to re-roll a real severity for an old entry
 *   here. `migrateV13ToV14` instead marks EVERY pre-v14 issue (on owned
 *   cars, active-lot cars, and `activeServiceJobs[].car` - a third
 *   `CarInstance` population generated the same way) as `severityPercent: 0,
 *   repaired: true`. Correct for owned cars (the old sliding-scale handover
 *   rule already applied their severity to `condition` directly, so treating
 *   them as "already dealt with" avoids double-punishing); for the small
 *   number of in-flight lot/service cars in any given save, this simply
 *   means they carry no live issue - the next weekly catalog refresh brings
 *   freshly-rolled ones under the new rules.
 * - v15 (Sprint 25 task 2): `ServiceJob` gained `arrivesOnDay` - accepting a
 *   job no longer places the customer's car in the shop instantly; it
 *   arrives the following morning. Purely additive with a schema default of
 *   `null`, and `null` is also the semantically correct value for every
 *   pre-v15 accepted job: under the old instant-placement rule every such
 *   car was already fully in the shop, so decoding it as "already arrived"
 *   is exactly right, not a simplification. No explicit `MIGRATIONS[14]`
 *   step needed.
 * - v16 (Sprint 26, the banded parts model): the single biggest structural
 *   change this file has ever needed to carry. `CarInstance.components` (8
 *   flat `condition: 0-100` zones) is replaced by `CarInstance.parts` (29
 *   real parts, each holding a named `ConditionBand`); `PartInstance`'s own
 *   `conditionPercent` becomes `band` the same way; `hiddenIssues` is
 *   dropped entirely (the paused inspection system is removed, not just
 *   paused); the 8-way component-group set collapses to 6
 *   (`forcedInduction` folds into `engine`, `brakes` folds into
 *   `suspension` - see `ComponentIdSchema`'s doc comment in
 *   `packages/content/src/tags.ts`); `Job`/`StagedAction` drop the
 *   `fix-issue`/`repair` kind's `issueId` field in favor of a `targetBand`
 *   the player climbs the whole group toward. None of this is a plain
 *   default-fill - a schema-default `parts` would silently strand every
 *   real car's condition. `migrateV15ToV16` reconstructs it instead,
 *   following sprint26.md decision 11's locked mapping: each old group's
 *   `condition` percent buckets through `bandForMigratedCondition` (the same
 *   percent-to-band thresholds `generateAuctionCarInstance` now generates
 *   with - directive 16, one mapping, not two) and fans out to every new
 *   part in that group uniformly (the flat old model never had
 *   sub-component granularity to preserve); an old group's `installed`
 *   `PartInstance`, if any, is relocated to its correct new part slot by
 *   looking its catalog `Part.carPartId` up in `PARTS` (`ignitionEcu` for
 *   the old ECU part, `internals` for an internals kit, `forcedInduction`
 *   for a turbo kit, `brakePadsDiscs` for a brake part, etc. - whatever the
 *   part's own current catalog address already resolves to); `aero` has no
 *   old-model counterpart at all and always migrates to `mint` (decision
 *   11's explicit carve-out); `forcedInduction.fitted` is `true` only on a
 *   `Turbo`- or `Supercharged`-tagged model, `false` on every NA car (an
 *   empty slot, matching how it's rolled fresh). This is also the first
 *   migration in this file to need a content-catalog lookup (`CARS` for a
 *   model's tags, `PARTS` for a catalog part's `carPartId`) - every earlier
 *   migration deliberately stayed a pure structural transform (see v14's
 *   entry above), but decision 11 explicitly calls for tag- and
 *   catalog-address-aware remapping, and both `CARS`/`PARTS` are plain,
 *   already-parsed static data (this file already imports `GameStateSchema`
 *   from the same content package), not a live/async lookup - so importing
 *   them here is a deliberate, narrow exception to that precedent, not a
 *   dependency direction anyone should generalize from. Every `Job` and
 *   `StagedAction` with the now-retired `fix-issue`/`fix-issue` kind is
 *   dropped outright (kept, it would fail `JobKindSchema`/`StagedActionSchema`
 *   validation outright, not just decode with a wrong default); a surviving
 *   `repair-zone` `Job` or `repair` `StagedAction` gets `targetBand: 'mint'`
 *   (the pre-Sprint-26 behavior every repair implicitly had); every
 *   surviving `Job`/`StagedAction`/`ServiceJobWork`'s `componentId` is
 *   remapped through the same 8-to-6 group fold. Applied uniformly across
 *   `ownedCars`, `activeAuctionLots[].car`, `activeServiceJobs[].car`,
 *   `serviceJobOffers[].car`, `partInventory`, `jobs`, and `stagedCarWork` -
 *   every real population of `CarInstance`/`PartInstance`/`Job`/
 *   `StagedAction`/`ServiceJobWork` this GameState carries.
 * - v17 (Sprint 28, per-part addressing): `JobSchema` and
 *   `StagedActionSchema` (both `packages/content/src`, both persisted - in
 *   `state.jobs` and `state.stagedCarWork` respectively) each gained one new
 *   field, `carPartId`, `.optional()` with no `.default(...)` - the per-part
 *   drill-down's address (a job/stage that climbs or replaces one specific
 *   part rather than a whole 6-way group). This is the normal additive case,
 *   exactly like v2-v8 above: it needs NO `MIGRATIONS[16]` entry, because a
 *   v16 save's group-level jobs and staged work decode unchanged with
 *   `carPartId` simply absent (`undefined`), which is precisely a
 *   group-level address under the new schema. The version bump itself is
 *   still required and separate from a migration (Save law / engineering law
 *   4: *every* save-schema change bumps the version, migration or not): the
 *   bump is what makes a pre-Sprint-28 client REJECT a Sprint-28 save
 *   (`decodeSave`'s `envelope.version > SAVE_VERSION` throws "newer version")
 *   rather than silently strip the unknown `carPartId` via `.parse` and
 *   degrade per-part staged work back to group-level. `saveCodec.test.ts`'s
 *   three Sprint 28 tests (immediately before the v15->v16 migration
 *   `describe` block) cover this: a v16 group-level save still decodes
 *   cleanly under v17 (additive backward-compat), a group-only v17 state
 *   round-trips unchanged, and a per-part v17 state round-trips its
 *   `carPartId` exactly.
 * - v18 (Sprint 29, service-jobs framework v2): `ServiceJobSchema`'s single
 *   `work: {kind, componentId}` field is replaced by `tasks: ServiceJobTask[]`
 *   (per-part addressed, not per-group), and it gains a new required
 *   `deadlineDays` (captured from the template at generation time, replacing
 *   the old flat `SERVICE_JOB_DEADLINE_DAYS` sim constant). Not a plain
 *   default-fill: `tasks` has no sensible schema default, and a v17 offer's
 *   `work` addressed a 6-way GROUP, not the specific `CarPartId` the new
 *   schema requires. `migrateV17ToV18` handles the two populations
 *   differently, per the sprint doc's own explicit call:
 *   - `activeServiceJobs` (in-flight, already-accepted jobs): KEPT, not
 *     dropped - a player mid-job shouldn't lose it to a version bump. Each
 *     entry's old `work` maps to a ONE-task `tasks` list: `kind: 'repair'`
 *     becomes a band-only requirement on `<representative part for that
 *     group>` targeting `mint` (every pre-Sprint-26 repair implicitly
 *     targeted mint, same reasoning `migrateJob`/`migrateStagedAction` at
 *     v15->v16 already use); `kind: 'install'` becomes a grade requirement
 *     on `<representative part>` at `stock` (the most permissive floor,
 *     since the old model had no grade requirement at all) - originally the
 *     `{action, carPartId, targetBand/minGrade}` shape this described,
 *     reshaped by `migrateServiceJobToTasks` itself into Sprint 72's
 *     `{requirement: {kind: 'slotCondition', ...}}` form so this
 *     migration's own output still validates under the current schema (see
 *     the v31 -> v32 entry below). `GROUP_TO_REPRESENTATIVE_PART` is a hardcoded historical table
 *     (mirrors `OLD_GROUP_TO_NEW_PARTS` at v15->v16) picking one real part
 *     per group - a deliberate, documented simplification: the old job
 *     required work across the WHOLE group, the migrated one-task version
 *     only requires that single representative part, which can only make an
 *     in-flight job easier to finish, never harder. Already-rolled
 *     `payoutYen` and `dueOnDay` are left untouched (the sprint doc's own
 *     instruction: never re-derive a live job's economics) - `deadlineDays`
 *     is backfilled from `dueOnDay - arrivesOnDay` when both are real
 *     numbers (reconstructing the original deadline exactly), or a flat
 *     7-day historical fallback (the pre-Sprint-29 constant's own value)
 *     when `arrivesOnDay` isn't available to reconstruct it from.
 *   - `serviceJobOffers` (not yet accepted): DROPPED, not mapped - the
 *     sprint doc's own "your call" on this population. Offers refresh daily
 *     under the new cadence (`generateDailyServiceJobOffers`, replacing the
 *     old weekly dump) and represent no player commitment yet, so guessing a
 *     representative task list for each one is pure risk (a wrong guess
 *     could misrepresent what the board is offering) for zero benefit (the
 *     board refills for real, correctly-generated offers within a day or
 *     two either way). `saveCodec.test.ts`'s `v17 -> v18 migration` describe
 *     block covers both populations.
 * - v19 (Sprint 30, living auctions): `AuctionLot` gained `turnout` - the
 *   Sprint 30 decision 3 rival-turnout band, rolled once at lot creation and
 *   persisted (replacing the old always-recomputed `turnoutBand` function,
 *   deleted this sprint). Purely additive with a schema default of
 *   `'steady'`, so a pre-v19 save's already-listed lots decode with a
 *   neutral turnout assumption - correct in kind (every prior migration
 *   facing an unrecoverable historical fact defaults rather than fabricates
 *   one; see e.g. v15's `arrivesOnDay: null`), and harmless in practice: an
 *   in-flight lot's ORIGINAL turnout roll never existed under the old model
 *   to recover, and 'steady' is the middle of the three bands, not a thumb
 *   on the scale either way. No explicit `MIGRATIONS[18]` step needed.
 * - v20 (Sprint 31, the walk-in offer stream): `PublicListing`/
 *   `activeListings` is gone outright - the "list publicly, wait N days,
 *   guaranteed sale" channel is replaced by the daily offer-stream mechanic
 *   (decision 2: a for-sale car draws a live, same-day-only offer instead).
 *   New `carsForSale`/`pendingOffers` fields are purely additive (both
 *   default to `[]`), but the removal is NOT: a genuinely pending pre-v20
 *   listing represents a car the player already parted with
 *   (`resolveListForSale` removed it from `ownedCars` the instant it was
 *   created) and real money still owed for it - dropping `activeListings`
 *   via a plain default-fill would silently delete that cash outright.
 *   `migrateV19ToV20` instead resolves every pending listing instantly at
 *   its already-locked `askingPriceYen` (least player harm: the sale the
 *   player was always going to get, just paid out now instead of on its
 *   original `resolvesOnDay`) before the `activeListings` key disappears.
 *   `carsForSale`/`pendingOffers` themselves need no reconstruction - a
 *   pre-v20 save's owned cars were never mid-offer under a mechanic that
 *   didn't exist yet, so both default-fill to empty correctly.
 * - v21 (Sprint 32, stock-baseline/missing-slot model): `CarPartState`
 *   drops its own `band`/`fitted` fields - the part occupying the slot
 *   (`installed`) now carries the only condition band there is, and
 *   `installed: null` alone means the slot is empty. Not a plain
 *   default-fill: a schema-default `{ installed: null }` would silently
 *   strand every real car's condition (its old slot-level `band`) and
 *   erase every already-fitted factory turbo (`fitted: true`, `installed:
 *   null` on a pre-v21 save, since aftermarket vs. factory forced induction
 *   was distinguished by `fitted` alone, never by `installed`).
 *   `migrateV20ToV21` reconstructs it per the sprint doc's own locked
 *   mapping, per part, per `CarInstance`: `fitted: false` (the old NA
 *   forced-induction carve-out, the only way `fitted` was ever false) ->
 *   `{ installed: null }`, the new model's own legitimate-absence case,
 *   unchanged in kind; otherwise, if the old slot's `installed` was already
 *   a real `PartInstance` (an aftermarket part, or - on a factory-turbo car
 *   - a still-null-`installed`-but-`fitted:true` case falls through to the
 *   next branch instead), it's kept exactly as-is, since a `PartInstance`
 *   has carried its own `band` since Sprint 26 and needs no reconstruction;
 *   otherwise (every ordinary part, and a factory turbo that was never
 *   explicitly replaced) a fresh generic stock `PartInstance` is synthesized
 *   at the OLD SLOT's own `band` - the position's only recorded condition
 *   when nothing was explicitly installed - referencing whichever catalog
 *   part is `grade: 'stock'` for that `CarPartId` (Sprint 32 decision 1
 *   guarantees exactly one). No pre-v21 save has a "missing" slot (the
 *   concept did not exist), so nothing migrates to `null` except the
 *   pre-existing NA-forced-induction case. Applied to every real
 *   `CarInstance` population: `ownedCars`, `activeAuctionLots[].car`,
 *   `activeServiceJobs[].car`, `serviceJobOffers[].car` - `partInventory`
 *   needs no migration here, since a bare `PartInstance` (not wrapped in a
 *   `CarPartState`) never had a `band`/`fitted` split to begin with.
 * - v22 (Sprint 35, customer-owned parts + in-inventory reconditioning): two
 *   additive schema changes, the normal case (like v2-v8 and v17), so NEITHER
 *   needs a `MIGRATIONS[21]` entry - a v21 save decodes cleanly under v22 with
 *   both new fields simply absent, which is exactly their default meaning.
 *   (1) `PartInstanceSchema` gained an optional `customerJobId` (a part pulled
 *   off a customer's car, tracked in inventory but locked from sale/scrap);
 *   absent = player-owned, the state of every pre-v22 part, so every existing
 *   inventory and installed part reads as player-owned unchanged. (2)
 *   `JobKindSchema` gained `'recondition-part'` (a repair job targeting a
 *   loose inventory part instead of a car slot); no pre-v22 save has one, so
 *   there is nothing to map. The version bump itself is still required (Save
 *   law / engineering law 4: every save-schema change bumps the version,
 *   migration or not) - it's the guard that makes a pre-Sprint-35 client
 *   REJECT a Sprint-35 save (`decodeSave`'s `envelope.version > SAVE_VERSION`
 *   throws "newer version") rather than silently strip `customerJobId` and
 *   quietly unlock a customer's part for sale. `saveCodec.test.ts`'s two
 *   Sprint 35 tests cover it: a real v21 save with an untagged inventory part
 *   still decodes (backward-compat, part reads player-owned), and a v22 state
 *   with a `customerJobId`-tagged part round-trips the tag exactly.
 * - v23 (Sprint 36, tool lines): `ownedEquipmentIds` (binary equipment
 *   ownership, Sprint 13) is replaced by `toolTiers` - six always-owned tool
 *   lines keyed by `ComponentId`, each at tier 1-3, all 1 at new game. Not a
 *   plain default-fill: a legacy save's owned machines represent real repair
 *   capability (and real money spent) that must map onto the new ladder
 *   rather than silently reset to all-1. `migrateV22ToV23` builds `toolTiers`
 *   from the save's `ownedEquipmentIds` using a frozen legacy map (hardcoded
 *   inline, the `GROUP_TO_REPRESENTATIVE_PART` pattern - `equipment.json` no
 *   longer exists to derive it from): per group, tier = the max level among
 *   owned ids covering it, else 1; unknown ids are ignored; then
 *   `ownedEquipmentIds` is deleted. `ServiceJobTaskSchema` also gained an
 *   optional-with-default `minToolTier` (default 1), a normal additive change
 *   needing no migration of its own - every legacy task decodes at the
 *   no-ceiling floor, which is exactly this sprint's authored content too.
 * - v24 (Sprint 38, specialty - the progression bible's horizontal axis):
 *   `GameStateSchema` gained `specialty`, a per-`ComponentId` word-of-mouth
 *   counter, defaulted all-zero. The normal additive case (like v2/v22): a
 *   pre-v24 save never earned any specialty (the concept did not exist), so
 *   all-zero is exactly the correct backfill, needing no `MIGRATIONS[23]`
 *   entry of its own. The version bump alone is still required (Save law) so
 *   an old client rejects a v24 save rather than silently dropping the field.
 * - v25 (Sprint 42, the flip ledger): `GameStateSchema` gained `carLedgers`
 *   (per-owned-car spend record, keyed by carInstanceId - purchase price,
 *   repairs, installed-part cost), defaulted to `{}`; `PartInstanceSchema`
 *   gained an optional `pricePaidYen`; `'car-sold'` gained an optional
 *   `profitYen`. All three are the normal additive case (like v2/v22/v24): a
 *   pre-v25 save's already-owned cars simply have no ledger entry (the
 *   concept did not exist), which is exactly `carLedgerFor`'s own
 *   unknown-purchase default (`gameStore.ts`) - the financial panel shows
 *   "-" for purchase rather than fabricating a number, needing no
 *   `MIGRATIONS[24]` entry of its own. The version bump alone is still
 *   required (Save law) so an old client rejects a v25 save rather than
 *   silently dropping the new fields.
 * - v26 (Sprint 45, the double-parking grace slot): `GameStateSchema` gained
 *   `graceParkingCarId`, defaulted to `null`. The normal additive case (like
 *   v2/v22/v24/v25): a pre-v26 save never had a double-parked car (the
 *   concept did not exist - every pre-Sprint-45 acquisition either placed
 *   into real parking or was refused outright), so `null` is exactly the
 *   correct backfill, needing no `MIGRATIONS[25]` entry of its own. The
 *   version bump alone is still required (Save law) so an old client rejects
 *   a v26 save rather than silently dropping the field.
 * - v27 (Sprint 52, the used-machinery classifieds): `GameStateSchema` gained
 *   `machineListing` (the current listing, if any) and `nextMachineListingDay`
 *   (the gap timer), both defaulted to `null`. The normal additive case (like
 *   v2/v22/v24/v25/v26): a pre-v27 save never had a listing or a scheduled
 *   one (the concept did not exist - every tool tier that cleared reputation
 *   was instantly purchasable), so `null`/`null` is exactly the correct
 *   backfill (the very first `rollMachineListings` day-boundary tick after
 *   loading starts the gap timer fresh, same as a brand-new career reaching
 *   eligibility for the first time), needing no `MIGRATIONS[26]` entry of its
 *   own. The version bump alone is still required (Save law) so an old
 *   client rejects a v27 save rather than silently dropping the fields.
 * - v28 (Sprint 53, fitment-class parts): the catalog gained real per-class
 *   SKUs (economy-bible.md law 3) - the pre-Sprint-53 116 ids are kept
 *   unchanged as the `common` class, so a pre-v28 save's `partId` references
 *   still resolve (no schema field changed shape; `Part.fitmentClass` is
 *   catalog data, not save data). NOT the pure-additive case, though: a
 *   pre-v28 save's installed/inventory parts are all implicitly `common`-
 *   class regardless of their host car's real tier, which would leave an
 *   already-owned shitbox showing family-priced (4x too expensive) repair
 *   bills forever. `migrateV27ToV28` remaps every real `PartInstance`
 *   reference (`ownedCars`, `activeAuctionLots[].car`, `activeServiceJobs[].car`,
 *   `serviceJobOffers[].car`, plus customer-tagged loose `partInventory`
 *   entries whose owning job is still active) from its old `common`-class id
 *   to the matching SKU at its host car's real fitment class, same
 *   (carPartId, grade) - a straight sideways relabel, never a price or
 *   condition change. Untagged loose `partInventory` parts (no recoverable
 *   host car) and `pendingPartOrders` are left as `common` (decision 6's own
 *   "else common" default) - they already are. The version bump is still
 *   required (Save law) even though `GameStateSchema` itself gained no new
 *   field, since a pre-v28 client's `Part` lookups would silently mis-price
 *   a v28-authored save without it.
 */
/**
 * v28 -> v29 (Sprint 57, the job ledger): `GameStateSchema` gained
 * `serviceJobLedgers` (default `{}`) - the normal additive case, so it needs
 * no `MIGRATIONS[28]` entry, but it DOES bump `SAVE_VERSION` (Save law).
 * v29 -> v30 (Sprint 61, baseline-tracked installs): `ServiceJobSchema` gained
 * `baselineInstalledPartIds` (default `{}`) - again the normal additive case,
 * no `MIGRATIONS[29]` entry needed. An in-flight pre-v30 job decodes with an
 * empty baseline, which `isServiceTaskDone` reads as the legacy "any
 * qualifying part present is done" semantics for that job only (so a save
 * mid-job never breaks); every new offer snapshots a real baseline. The
 * version bump alone is still required (Save law) so an old client rejects a
 * v30 save rather than silently dropping the field.
 * v30 -> v31 (Sprint 70, parts provenance): `PartInstanceSchema` gained a
 * REQUIRED `origin` field and lost `customerJobId` entirely. Not the pure
 * additive case, and directive 19 (no pre-launch save compatibility) is what
 * makes that fine: no `MIGRATIONS[30]` entry, no backfill, no legacy-compat
 * branch. A pre-v31 save simply fails to decode - `origin` is required, so
 * `GameStateSchema.parse` throws a `ZodError` on every part in it (this
 * function does not catch that itself); every real caller already wraps
 * `decodeSave` in its own try/catch (`hydrate`/`importSaveCode`,
 * gameStore.ts) and falls back to a new game on any decode failure, same as
 * a corrupted save code. The version bump is what makes a v31 save at least
 * attempt this schema rather than an older one silently misreading it.
 * v31 -> v32 (Sprint 72, outcome-based service jobs): `ServiceJobTaskSchema`
 * dropped the `action`/`targetBand`/`minGrade`/`carPartId` shape entirely for
 * a single `{ requirement: RequirementSpec, minToolTier }` shape, and
 * `ServiceJobSchema` lost `baselineInstalledPartIds` (its one remaining
 * consumer, `isServiceTaskDone`'s instance-identity check, is retired - "any
 * route counts" now). Not the pure additive case, and directive 19 (no
 * pre-launch save compatibility) is what makes that fine: no
 * `MIGRATIONS[31]` entry, no backfill, no legacy-compat branch. A pre-v32
 * save's old-shaped tasks fail `ServiceJobTaskSchema.parse` outright, the
 * same fallback-to-new-game path every other non-additive bump already
 * relies on (see v30 -> v31's own comment above).
 * v32 -> v33 (Sprint 73, diagnosis I): `CarInstanceSchema` gained two new
 * fields - `symptoms` (default `[]`) and `apparentBandByPartId` (default
 * `null`). Both are the pure additive case (a fresh field with a sensible
 * default), so this needs NO `MIGRATIONS[32]` entry; the version bump alone
 * is still required (Save law) so a pre-v33 client never silently misreads
 * a v33 save that happens to omit these two brand-new keys.
 * v33 -> v34 (Sprint 74, diagnosis II): `GameState` gained `inspectionVisit`
 * (default `null`) and each car symptom entry gained `runTestIds` (default
 * `[]`) - both the pure additive case, no `MIGRATIONS[33]` entry; the
 * version bump alone is still required (Save law).
 * v34 -> v35 (Sprint 76, story missions I): `GameState` gained `storyMissions`
 * (default `[]`) - the pure additive case, no `MIGRATIONS[34]` entry; a
 * pre-v35 save never had a campaign mission in progress (the concept did not
 * exist), so an empty array is exactly correct - the next `advanceDay` call
 * offers the campaign's first mission fresh, same as a brand-new career. The
 * version bump alone is still required (Save law).
 * v35 -> v36 (Sprint 79, the equivalence-priced labour model): each car
 * part slot (`CarPartStateSchema`, content/src/carInstance.ts) gained an
 * OPTIONAL `vacatedBaseline` field with no default - the pure additive case
 * (a genuinely optional key, not a defaulted one), so this needs no
 * `MIGRATIONS[35]` entry. A pre-v36 save simply decodes with every slot's
 * `vacatedBaseline` absent (`undefined`), which reads identically to "no
 * baseline yet" - exactly correct, since no pre-v36 save could have recorded
 * one. The version bump alone is still required (Save law).
 * v36 -> v37 (Sprint 80, staff I): `GameState` gained `staffAds` (default
 * `[]`) - the pure additive case, no `MIGRATIONS[36]` entry. A pre-v37 save
 * never had a job-ad board (the concept did not exist), so an empty array is
 * exactly correct - the next weekly `advanceDay` boundary posts the first
 * ads fresh. The version bump alone is still required (Save law).
 * v37 -> v38 (Sprint 80 crew-model rework): `StaffMemberSchema` changed shape -
 * hustle removed from `stats`, `laborSlotsPerDay`/`assignment`/
 * `pendingAssignment` added - and the `service-bay-income` day-log entry was
 * renamed `contract-income`. NOT purely additive, so under the Save law this
 * would need a migration; suspended by directive 19 (no players, no old saves
 * pre-launch), a pre-v38 save with staff simply fails `StaffMemberSchema.parse`
 * and falls back to a new game, no `MIGRATIONS[37]` entry. The version bump
 * alone is required so a pre-v38 client never silently misreads a v38 save.
 * v38 -> v39 (Sprint 85, decision 2: story missions unfailable):
 * `StoryMissionRecordSchema` dropped `dueOnDay`/`reofferOnDay` and the
 * `lapsed` status, and the `mission-accepted` day-log entry dropped `dueOnDay`
 * (the `mission-lapsed`/`mission-reoffered` entries are gone entirely). NOT
 * purely additive (a removed enum member and fields), so under the Save law
 * this would need a migration; suspended by directive 19 (no players, no old
 * saves pre-launch), a pre-v39 save carrying a `lapsed` mission record simply
 * fails to decode and falls back to a new game, no `MIGRATIONS[38]` entry. The
 * version bump alone is required so a pre-v39 client never silently misreads a
 * v39 save. (The single bump for the sprint - decisions 3/5/6 add only content
 * knobs and transactional fees, no new persisted GameState shape.)
 * v39 -> v40 (Sprint 87, the assembly model): `GameStateSchema` gained
 * `assemblyInventory` - sub-assemblies currently on the bench
 * (`AssemblyContainerSchema`). It is `.optional()` (not `.default([])`), the
 * same genuinely-optional treatment Sprint 79's `vacatedBaseline` used, so a
 * pre-v40 save decodes with it simply absent - exactly correct, since no
 * pre-v40 save could have had a benched assembly (the concept did not exist),
 * and every reader treats absent as an empty bench (`?? []`). The pure additive
 * case (like v33/v34/v36), no `MIGRATIONS[39]` entry needed; the version bump
 * alone is still required (Save law) so an old client rejects a v40 save rather
 * than silently dropping the field. (The single bump for the sprint - the
 * wheels assist fee is a content knob and the assembly resolvers post to the
 * existing ledgers, so `assemblyInventory` is the one new persisted shape.)
 * v40 -> v41 (Sprint 89, Yuki teaches you the game): two additive schema
 * changes for the guided tutorial. `GameStateSchema` gained `tutorialStatus`
 * (`.optional()`, absent = not a tutorial career) and `AuctionLotSchema` gained
 * `scripted` (`.optional()`, absent = an ordinary lot). Both are the pure
 * additive case (like v33/v34/v36/v40, the genuinely-optional-key pattern), so
 * this needs NO `MIGRATIONS[40]` entry; a pre-v41 save decodes with both simply
 * absent, which is exactly their default meaning. The version bump alone is
 * still required (Save law) so an old client rejects a v41 save rather than
 * silently dropping the fields.
 * v41 -> v42 (Sprint 94, the energy bar): `GameState.laborSlotsSpentToday`
 * (integer slots) became `energySpentToday` (fine-grained integer energy points,
 * `pointsPerLabour` per old slot). Per directive 19 (no pre-launch save
 * compat), this is a plain Dexie/SAVE_VERSION bump with NO migration: a pre-v42
 * save's `laborSlotsSpentToday` is simply ignored and `energySpentToday`
 * default-fills to 0 (a fresh day's labour), which is harmless - the field is
 * reset every day boundary anyway. Had the save law been in force this would
 * have earned a rename migration; it is deliberately skipped pre-launch.
 * v42 -> v43 (Sprint 95, the tutorial actually guides): `GameStateSchema`
 * gained `tutorialAcknowledgedSteps` (`.optional()`, the genuinely-optional-key
 * pattern, like `tutorialStatus` at v41) - the tutorial step ids the player has
 * pressed "Got it" on. The pure additive case, no `MIGRATIONS[42]` entry; a
 * pre-v43 save decodes with it simply absent, which reads as "nothing
 * acknowledged yet", exactly correct. The version bump alone is still required
 * (Save law) so an old client rejects a v43 save rather than silently dropping
 * the field.
 */
export const SAVE_VERSION = 43

/** Stable format marker (NOT the schema version - that lives in the envelope). */
const PREFIX = 'MGSAVE1.'

interface SaveEnvelope {
  version: number
  gameState: unknown
}

// UTF-8-safe base64 (btoa is Latin1-only). Save payloads are small.
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(b64: string): string {
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * v8 -> v9 (Sprint 17): reconstructs the real, index-addressable
 * `serviceBayCarIds`/`parkingCarIds` shape from a pre-v9 save's compact
 * `serviceBayCarIds` list (see the SAVE_VERSION doc comment above for why
 * this can't be a plain default-fill). Defensive against a malformed or
 * hand-edited save - every field it reads is guarded with a runtime type
 * check rather than assumed, since `gameState` here is still `unknown`.
 */
function migrateV8ToV9(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>

  const oldServiceBayIds = Array.isArray(state.serviceBayCarIds)
    ? state.serviceBayCarIds.filter((id): id is string => typeof id === 'string')
    : []
  const serviceBayCount =
    typeof state.serviceBayCount === 'number' ? state.serviceBayCount : oldServiceBayIds.length
  const parkingBayCount = typeof state.parkingBayCount === 'number' ? state.parkingBayCount : 0

  const ownedCars = Array.isArray(state.ownedCars) ? state.ownedCars : []
  const activeServiceJobs = Array.isArray(state.activeServiceJobs) ? state.activeServiceJobs : []
  const inOldServiceBay = new Set(oldServiceBayIds)
  const parkedIds: string[] = []
  for (const car of ownedCars) {
    const id = (car as { id?: unknown } | null)?.id
    if (typeof id === 'string' && !inOldServiceBay.has(id)) parkedIds.push(id)
  }
  for (const job of activeServiceJobs) {
    const id = (job as { car?: { id?: unknown } } | null)?.car?.id
    if (typeof id === 'string' && !inOldServiceBay.has(id)) parkedIds.push(id)
  }

  // Pad each reconstructed array to its real bay count with empty slots; a
  // save whose real occupancy somehow exceeds its own count (shouldn't
  // happen via normal play) keeps every id as a genuine overflow slot
  // rather than silently dropping one.
  const serviceBayCarIds: (string | null)[] = []
  for (let i = 0; i < serviceBayCount; i++) serviceBayCarIds.push(oldServiceBayIds[i] ?? null)
  for (let i = serviceBayCount; i < oldServiceBayIds.length; i++) {
    serviceBayCarIds.push(oldServiceBayIds[i]!)
  }

  const parkingCarIds: (string | null)[] = []
  for (let i = 0; i < parkingBayCount; i++) parkingCarIds.push(parkedIds[i] ?? null)
  for (let i = parkingBayCount; i < parkedIds.length; i++) parkingCarIds.push(parkedIds[i]!)

  return { ...state, serviceBayCarIds, parkingCarIds }
}

/**
 * v11 -> v12 (Sprint 20, auction rework II): reconstructs each active lot's
 * open-bidding state (`currentBidYen`/`leadingBidder`/`quietDays`/
 * `playerHasBid`) from the old sealed-max + per-rival-escalation shape - see
 * the SAVE_VERSION doc comment above for why a plain default-fill would
 * silently drop a real in-flight bid. Defensive against a malformed or
 * hand-edited save, same as `migrateV8ToV9` above.
 */
function migrateV11ToV12(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>
  if (!Array.isArray(state.activeAuctionLots)) return state

  const activeAuctionLots = state.activeAuctionLots.map((lot) => {
    if (typeof lot !== 'object' || lot === null) return lot
    const l = lot as Record<string, unknown>
    const playerMaxBidYen = typeof l.playerMaxBidYen === 'number' ? l.playerMaxBidYen : null
    const rivalEscalatedBidsYen = Array.isArray(l.rivalEscalatedBidsYen)
      ? l.rivalEscalatedBidsYen.filter((n): n is number => typeof n === 'number')
      : []
    const topRivalYen = Math.max(0, ...rivalEscalatedBidsYen)
    const currentBidYen = Math.max(playerMaxBidYen ?? 0, topRivalYen)
    const leadingBidder: 'player' | 'rival' | null =
      currentBidYen === 0 ? null : (playerMaxBidYen ?? 0) >= topRivalYen ? 'player' : 'rival'
    return {
      ...l,
      currentBidYen,
      leadingBidder,
      quietDays: 0,
      playerHasBid: playerMaxBidYen !== null,
    }
  })

  return { ...state, activeAuctionLots }
}

/**
 * v13 -> v14 (Sprint 22, hidden issues): marks every existing `CarInstance`
 * hidden-issue entry (owned cars, active-lot cars, and
 * `activeServiceJobs[].car`) `severityPercent: 0, repaired: true` - see the
 * SAVE_VERSION doc comment above for why. Defensive against a malformed or
 * hand-edited save, same shape as the migrations above.
 */
function migrateHiddenIssues(hiddenIssues: unknown): unknown {
  if (!Array.isArray(hiddenIssues)) return hiddenIssues
  return hiddenIssues.map((issue) => {
    if (typeof issue !== 'object' || issue === null) return issue
    return { ...issue, severityPercent: 0, repaired: true }
  })
}

function migrateCarInstance(car: unknown): unknown {
  if (typeof car !== 'object' || car === null) return car
  const c = car as Record<string, unknown>
  return { ...c, hiddenIssues: migrateHiddenIssues(c.hiddenIssues) }
}

function migrateV13ToV14(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>

  const ownedCars = Array.isArray(state.ownedCars)
    ? state.ownedCars.map(migrateCarInstance)
    : state.ownedCars
  const activeAuctionLots = Array.isArray(state.activeAuctionLots)
    ? state.activeAuctionLots.map((lot) => {
        if (typeof lot !== 'object' || lot === null) return lot
        const l = lot as Record<string, unknown>
        return { ...l, car: migrateCarInstance(l.car) }
      })
    : state.activeAuctionLots
  const activeServiceJobs = Array.isArray(state.activeServiceJobs)
    ? state.activeServiceJobs.map((sj) => {
        if (typeof sj !== 'object' || sj === null) return sj
        const s = sj as Record<string, unknown>
        return { ...s, car: migrateCarInstance(s.car) }
      })
    : state.activeServiceJobs

  return { ...state, ownedCars, activeAuctionLots, activeServiceJobs }
}

/**
 * Sprint 26 decision 11's old-group -> new-parts fan-out. A historical fact
 * about the pre-v16 8-way split, not derivable from current content (that
 * split no longer exists anywhere but here).
 */
const OLD_GROUP_TO_NEW_PARTS: Record<string, readonly string[]> = {
  engine: [
    'block',
    'internals',
    'headValvetrain',
    'camsTiming',
    'intake',
    'exhaust',
    'fuelSystem',
    'ignitionEcu',
    'cooling',
  ],
  forcedInduction: ['forcedInduction'],
  drivetrain: ['gearbox', 'clutch', 'differential', 'driveline', 'chassis'],
  suspension: ['dampers', 'springs', 'antiRollBars', 'steering'],
  brakes: ['brakePadsDiscs', 'brakeCalipersLines'],
  wheels: ['rims', 'tyres'],
  body: ['panels', 'paint', 'underbody'],
  interior: ['seats', 'dashGauges'],
}

/** Old 8-way group id -> new 6-way `ComponentId` (`forcedInduction` folds
 * into `engine`, `brakes` folds into `suspension`; the other 6 are unchanged). */
function remapGroupId(oldGroupId: string): ComponentId {
  if (oldGroupId === 'forcedInduction') return 'engine'
  if (oldGroupId === 'brakes') return 'suspension'
  return oldGroupId as ComponentId
}

const MODEL_TAGS_BY_ID: Record<string, readonly string[]> = Object.fromEntries(
  CARS.map((model) => [model.id, model.tags]),
)
const CAR_PART_ID_BY_CATALOG_PART_ID: Record<string, string> = Object.fromEntries(
  PARTS.map((part) => [part.id, part.carPartId]),
)

/** v15 -> v16 (Sprint 26): `PartInstance.conditionPercent` -> `band`. Leaves
 * the dead `conditionPercent` key in place; `PartInstanceSchema.parse`
 * strips it, same as every other migration in this file. */
function migratePartInstance(instance: unknown): unknown {
  if (typeof instance !== 'object' || instance === null) return instance
  const i = instance as Record<string, unknown>
  const conditionPercent = typeof i.conditionPercent === 'number' ? i.conditionPercent : 100
  return { ...i, band: bandForMigratedCondition(conditionPercent, ECONOMY) }
}

/**
 * v15 -> v16 (Sprint 26): reconstructs one `CarInstance`'s 29-part `parts`
 * map from its pre-v16 8-key `components` map - see the SAVE_VERSION doc
 * comment above for the full mapping. Defensive against a malformed or
 * hand-edited save, same shape as the migrations above. The old
 * `components`/`hiddenIssues` keys are left in place; `CarInstanceSchema`
 * no longer declares either, so `.parse` strips them.
 */
function migrateCarInstanceToBands(car: unknown): unknown {
  if (typeof car !== 'object' || car === null) return car
  const c = car as Record<string, unknown>
  // A car with no `components` object at all isn't a genuine pre-v16 shape
  // (e.g. the still-older Sprint-12-pre-refactor `condition`/`buildSheet`
  // shape, deliberately left unmigrated - see the v5 entry in the
  // SAVE_VERSION doc comment). Leave it untouched rather than fabricating a
  // `parts` map from nothing: the final `GameStateSchema.parse` below must
  // still reject it, the same as it always has.
  if (typeof c.components !== 'object' || c.components === null) return c
  const oldComponents = c.components as Record<string, unknown>
  const modelId = typeof c.modelId === 'string' ? c.modelId : undefined
  const tags = modelId ? (MODEL_TAGS_BY_ID[modelId] ?? []) : []
  const isForcedInductionFitted = tags.includes('Turbo') || tags.includes('Supercharged')

  const parts: Record<string, { band: string; installed: unknown; fitted: boolean }> = {
    aero: { band: 'mint', installed: null, fitted: true },
  }

  for (const [groupId, newPartIds] of Object.entries(OLD_GROUP_TO_NEW_PARTS)) {
    const groupState = oldComponents[groupId] as
      { condition?: unknown; installed?: unknown } | undefined
    const conditionPercent = typeof groupState?.condition === 'number' ? groupState.condition : 100
    const band = bandForMigratedCondition(conditionPercent, ECONOMY)
    const installed = groupState?.installed
    const installedRecord =
      typeof installed === 'object' && installed !== null
        ? (installed as Record<string, unknown>)
        : null
    const installedCarPartId =
      installedRecord && typeof installedRecord.partId === 'string'
        ? CAR_PART_ID_BY_CATALOG_PART_ID[installedRecord.partId]
        : undefined

    for (const partId of newPartIds) {
      const fitted = partId === 'forcedInduction' ? isForcedInductionFitted : true
      if (installedCarPartId === partId) {
        parts[partId] = { band, installed: migratePartInstance(installedRecord), fitted: true }
      } else {
        parts[partId] = { band, installed: null, fitted }
      }
    }
  }

  return { ...c, parts }
}

/** v15 -> v16: drops a retired `fix-issue` job (the kind no longer validates
 * at all), remaps a surviving job's group id, and backfills `targetBand:
 * 'mint'` on a `repair-zone` job (every pre-v16 repair implicitly climbed to
 * mint - `targetBand` didn't exist as a concept before this). */
function migrateJob(job: unknown): unknown[] {
  if (typeof job !== 'object' || job === null) return [job]
  const j = job as Record<string, unknown>
  if (j.kind === 'fix-issue') return []
  const componentId =
    typeof j.componentId === 'string' ? remapGroupId(j.componentId) : j.componentId
  const targetBand = j.kind === 'repair-zone' ? 'mint' : j.targetBand
  return [{ ...j, componentId, targetBand }]
}

/** v15 -> v16: the `StagedAction` counterpart to `migrateJob` above - a
 * `repair` stage requires `targetBand` under the new schema (no default),
 * so a pre-v16 stage (which never carried one) needs it backfilled, not
 * left to a schema default that doesn't exist. */
function migrateStagedAction(action: unknown): unknown[] {
  if (typeof action !== 'object' || action === null) return [action]
  const a = action as Record<string, unknown>
  if (a.kind === 'fix-issue') return []
  const componentId =
    typeof a.componentId === 'string' ? remapGroupId(a.componentId) : a.componentId
  if (a.kind === 'repair') return [{ ...a, componentId, targetBand: 'mint' }]
  return [{ ...a, componentId }]
}

/** v15 -> v16: `ServiceJobWork.componentId` remap - no `targetBand`/`issueId`
 * to touch, that schema never carried either. */
function migrateServiceJobWork(work: unknown): unknown {
  if (typeof work !== 'object' || work === null) return work
  const w = work as Record<string, unknown>
  const componentId =
    typeof w.componentId === 'string' ? remapGroupId(w.componentId) : w.componentId
  return { ...w, componentId }
}

function migrateServiceJob(serviceJob: unknown): unknown {
  if (typeof serviceJob !== 'object' || serviceJob === null) return serviceJob
  const sj = serviceJob as Record<string, unknown>
  return { ...sj, work: migrateServiceJobWork(sj.work), car: migrateCarInstanceToBands(sj.car) }
}

function migrateV15ToV16(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>

  const ownedCars = Array.isArray(state.ownedCars)
    ? state.ownedCars.map(migrateCarInstanceToBands)
    : state.ownedCars

  const activeAuctionLots = Array.isArray(state.activeAuctionLots)
    ? state.activeAuctionLots.map((lot) => {
        if (typeof lot !== 'object' || lot === null) return lot
        const l = lot as Record<string, unknown>
        return { ...l, car: migrateCarInstanceToBands(l.car) }
      })
    : state.activeAuctionLots

  const activeServiceJobs = Array.isArray(state.activeServiceJobs)
    ? state.activeServiceJobs.map(migrateServiceJob)
    : state.activeServiceJobs

  const serviceJobOffers = Array.isArray(state.serviceJobOffers)
    ? state.serviceJobOffers.map(migrateServiceJob)
    : state.serviceJobOffers

  const partInventory = Array.isArray(state.partInventory)
    ? state.partInventory.map(migratePartInstance)
    : state.partInventory

  const jobs = Array.isArray(state.jobs) ? state.jobs.flatMap(migrateJob) : state.jobs

  const stagedCarWork =
    typeof state.stagedCarWork === 'object' && state.stagedCarWork !== null
      ? Object.fromEntries(
          Object.entries(state.stagedCarWork as Record<string, unknown>).map(([carId, actions]) => [
            carId,
            Array.isArray(actions) ? actions.flatMap(migrateStagedAction) : actions,
          ]),
        )
      : state.stagedCarWork

  return {
    ...state,
    ownedCars,
    activeAuctionLots,
    activeServiceJobs,
    serviceJobOffers,
    partInventory,
    jobs,
    stagedCarWork,
  }
}

/**
 * v17 -> v18 (Sprint 29): hardcoded historical table picking one
 * representative real part per group - the migrated one-task shape for an
 * in-flight job's old group-level `work` (see the SAVE_VERSION doc comment
 * above). Mirrors `OLD_GROUP_TO_NEW_PARTS`'s own precedent (a fixed mapping
 * describing a fact about a RETIRED shape, not derivable from current
 * content).
 */
const GROUP_TO_REPRESENTATIVE_PART: Record<string, string> = {
  engine: 'block',
  drivetrain: 'gearbox',
  suspension: 'dampers',
  wheels: 'tyres',
  body: 'panels',
  interior: 'seats',
}

/** Historical fallback for a migrated job's `deadlineDays` when its
 * `arrivesOnDay`/`dueOnDay` pair isn't available to reconstruct the real
 * original deadline from - the pre-Sprint-29 flat `SERVICE_JOB_DEADLINE_DAYS`
 * sim constant's own value. Cosmetic only: an in-flight job's real
 * `dueOnDay` is preserved untouched either way (the sprint doc's own
 * instruction), so this never actually changes when the job is due. */
const LEGACY_DEADLINE_DAYS_FALLBACK = 7

/** v17 -> v18: one ServiceJob's old single `work` -> a one-task `tasks`
 * list, plus a backfilled `deadlineDays` - see the SAVE_VERSION doc comment
 * above for the full reasoning. Defensive against a malformed or
 * hand-edited save, same shape as every other migration in this file. */
function migrateServiceJobToTasks(serviceJob: unknown): unknown {
  if (typeof serviceJob !== 'object' || serviceJob === null) return serviceJob
  const sj = serviceJob as Record<string, unknown>
  const work = sj.work as { kind?: unknown; componentId?: unknown } | undefined
  const kind = work?.kind === 'install' ? 'install' : 'repair'
  const componentId = typeof work?.componentId === 'string' ? work.componentId : 'engine'
  const carPartId = GROUP_TO_REPRESENTATIVE_PART[componentId] ?? 'block'
  // Sprint 72 (outcome-based service jobs): this migration's own OUTPUT must
  // conform to the CURRENT task shape, since no later migration reshapes
  // `tasks` again - `action`/`targetBand`/`minGrade` collapsed into one
  // `requirement` (decision 2's exact repair->slotCondition/
  // install->slotCondition-with-minGrade-and-minBand-'fine' mapping).
  const task =
    kind === 'install'
      ? {
          requirement: {
            kind: 'slotCondition' as const,
            carPartId,
            minBand: 'fine' as const,
            minGrade: 'stock' as const,
          },
        }
      : {
          requirement: { kind: 'slotCondition' as const, carPartId, minBand: 'mint' as const },
        }

  const arrivesOnDay = typeof sj.arrivesOnDay === 'number' ? sj.arrivesOnDay : null
  const dueOnDay = typeof sj.dueOnDay === 'number' ? sj.dueOnDay : null
  const deadlineDays =
    arrivesOnDay !== null && dueOnDay !== null
      ? Math.max(1, dueOnDay - arrivesOnDay)
      : LEGACY_DEADLINE_DAYS_FALLBACK

  return { ...sj, tasks: [task], deadlineDays }
}

/**
 * v17 -> v18: `activeServiceJobs` entries are migrated in place (kept, task
 * list reconstructed); `serviceJobOffers` are dropped outright (see the
 * SAVE_VERSION doc comment above for why each population gets different
 * treatment).
 */
function migrateV17ToV18(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>
  const activeServiceJobs = Array.isArray(state.activeServiceJobs)
    ? state.activeServiceJobs.map(migrateServiceJobToTasks)
    : state.activeServiceJobs
  return { ...state, activeServiceJobs, serviceJobOffers: [] }
}

/**
 * v19 -> v20 (Sprint 31, listings removed): resolves every genuinely pending
 * `activeListings` entry instantly at its own locked `askingPriceYen`,
 * crediting the cash - see the SAVE_VERSION doc comment above for why this
 * can't be a plain default-fill (a real listing represents real money still
 * owed, not nothing). The listed car itself needs no handling here: under
 * the pre-v20 model it already left `ownedCars` the instant it was listed,
 * so there's no car object to reinsert anywhere, only the sale proceeds to
 * land. Defensive against a malformed or hand-edited save, same shape as
 * every other migration in this file.
 */
function migrateV19ToV20(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>
  if (!Array.isArray(state.activeListings) || state.activeListings.length === 0) return state

  let cashYen = typeof state.cashYen === 'number' ? state.cashYen : 0
  for (const listing of state.activeListings) {
    if (typeof listing !== 'object' || listing === null) continue
    const askingPriceYen = (listing as Record<string, unknown>).askingPriceYen
    if (typeof askingPriceYen === 'number') cashYen += askingPriceYen
  }
  return { ...state, cashYen }
}

/**
 * v20 -> v21 (Sprint 32): one `grade: 'stock'` catalog part id per
 * `CarPartId`, the fallback a slot with nothing explicitly `installed`
 * migrates to (see `migratePartSlotToStock` below). A historical mapping
 * needed only for this migration - the live game reads `SimContext`'s own
 * `stockPartByCarPartId` instead (sim/context.ts). Sprint 53: pinned to the
 * `common` fitment class - every save this migration ever runs against
 * predates the class system, and `common` is the pre-Sprint-53 catalog
 * unchanged, so this is exactly the part these saves would have seen.
 */
const STOCK_PART_ID_BY_CAR_PART_ID: Record<string, string> = Object.fromEntries(
  PARTS.filter((part) => part.grade === 'stock' && part.fitmentClass === 'common').map((part) => [
    part.carPartId,
    part.id,
  ]),
)

/** Monotonic id suffix for a synthesized stock `PartInstance` - migrations
 * fabricate real new objects here (unlike most migrations in this file,
 * which only reshape existing ones), so each needs its own fresh id. */
let migratedStockInstanceCounter = 0

/**
 * v20 -> v21: one `CarPartState` slot's old `{ band, installed, fitted }`
 * -> the new `{ installed }` - see the SAVE_VERSION doc comment above for
 * the full mapping this implements. Defensive against a malformed or
 * hand-edited save, same shape as every other migration in this file.
 */
function migratePartSlotToStock(oldSlot: unknown, carPartId: string): { installed: unknown } {
  if (typeof oldSlot !== 'object' || oldSlot === null) return { installed: null }
  const slot = oldSlot as { band?: unknown; installed?: unknown; fitted?: unknown }

  const fitted = slot.fitted !== false // schema default was true; only `false` ever meant NA-forced-induction
  if (!fitted) return { installed: null }

  if (typeof slot.installed === 'object' && slot.installed !== null) {
    return { installed: slot.installed }
  }

  const stockPartId = STOCK_PART_ID_BY_CAR_PART_ID[carPartId]
  if (!stockPartId) return { installed: null }
  const band = typeof slot.band === 'string' ? slot.band : 'mint'
  migratedStockInstanceCounter += 1
  return {
    installed: {
      id: `part-migrated-${migratedStockInstanceCounter}`,
      partId: stockPartId,
      band,
      genuinePeriod: false,
    },
  }
}

/** v20 -> v21: reconstructs one `CarInstance`'s 29-part `parts` map from its
 * pre-v21 `{ band, installed, fitted }` shape. Defensive against a
 * malformed or hand-edited save, same shape as every other migration in
 * this file. */
function migrateCarInstanceToStockBaseline(car: unknown): unknown {
  if (typeof car !== 'object' || car === null) return car
  const c = car as Record<string, unknown>
  if (typeof c.parts !== 'object' || c.parts === null) return c
  const oldParts = c.parts as Record<string, unknown>

  const parts: Record<string, { installed: unknown }> = {}
  for (const carPartId of ALL_CAR_PART_IDS) {
    parts[carPartId] = migratePartSlotToStock(oldParts[carPartId], carPartId)
  }
  return { ...c, parts }
}

/**
 * v20 -> v21: applies `migrateCarInstanceToStockBaseline` across every real
 * `CarInstance` population - `ownedCars`, `activeAuctionLots[].car`,
 * `activeServiceJobs[].car`, `serviceJobOffers[].car`. `partInventory` needs
 * no migration: a bare `PartInstance` never had a `band`/`fitted` split on
 * it to begin with (see the SAVE_VERSION doc comment above).
 */
function migrateV20ToV21(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>

  const ownedCars = Array.isArray(state.ownedCars)
    ? state.ownedCars.map(migrateCarInstanceToStockBaseline)
    : state.ownedCars

  const activeAuctionLots = Array.isArray(state.activeAuctionLots)
    ? state.activeAuctionLots.map((lot) => {
        if (typeof lot !== 'object' || lot === null) return lot
        const l = lot as Record<string, unknown>
        return { ...l, car: migrateCarInstanceToStockBaseline(l.car) }
      })
    : state.activeAuctionLots

  const activeServiceJobs = Array.isArray(state.activeServiceJobs)
    ? state.activeServiceJobs.map((sj) => {
        if (typeof sj !== 'object' || sj === null) return sj
        const s = sj as Record<string, unknown>
        return { ...s, car: migrateCarInstanceToStockBaseline(s.car) }
      })
    : state.activeServiceJobs

  const serviceJobOffers = Array.isArray(state.serviceJobOffers)
    ? state.serviceJobOffers.map((sj) => {
        if (typeof sj !== 'object' || sj === null) return sj
        const s = sj as Record<string, unknown>
        return { ...s, car: migrateCarInstanceToStockBaseline(s.car) }
      })
    : state.serviceJobOffers

  return { ...state, ownedCars, activeAuctionLots, activeServiceJobs, serviceJobOffers }
}

/**
 * v22 -> v23 (Sprint 36): the frozen legacy map from a retired equipment id
 * to the tool line it covered and the tier its `repairLevel` granted. A
 * historical fact about the pre-v23 equipment catalog, hardcoded inline
 * (the `GROUP_TO_REPRESENTATIVE_PART` pattern) since `equipment.json` no
 * longer exists to derive it from.
 */
const LEGACY_EQUIPMENT_TO_TOOL_TIER: Record<string, { group: string; level: number }> = {
  'tire-machine': { group: 'wheels', level: 2 },
  'brake-lathe': { group: 'suspension', level: 2 },
  'suspension-press': { group: 'suspension', level: 3 },
  'upholstery-bench': { group: 'interior', level: 2 },
  welder: { group: 'body', level: 2 },
  'transmission-bench': { group: 'drivetrain', level: 2 },
  'engine-crane': { group: 'engine', level: 3 },
}

/**
 * v22 -> v23 (Sprint 36): builds `toolTiers` from the save's
 * `ownedEquipmentIds` via the frozen map above - per group, tier = the max
 * level among owned ids covering it, else 1; unknown ids are ignored - then
 * deletes `ownedEquipmentIds`. Defensive against a malformed or hand-edited
 * save, same shape as every other migration in this file.
 */
function migrateV22ToV23(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>

  const toolTiers: Record<string, number> = {
    engine: 1,
    drivetrain: 1,
    suspension: 1,
    wheels: 1,
    body: 1,
    interior: 1,
  }
  const ownedEquipmentIds = Array.isArray(state.ownedEquipmentIds) ? state.ownedEquipmentIds : []
  for (const id of ownedEquipmentIds) {
    if (typeof id !== 'string') continue
    const mapped = LEGACY_EQUIPMENT_TO_TOOL_TIER[id]
    if (!mapped) continue // unknown legacy id - ignored
    toolTiers[mapped.group] = Math.max(toolTiers[mapped.group] ?? 1, mapped.level)
  }

  const migrated: Record<string, unknown> = { ...state, toolTiers }
  delete migrated.ownedEquipmentIds
  return migrated
}

/** Model id -> roster tier, for v27 -> v28's class remap (which fitment
 * class a car's parts should carry). */
const MODEL_TIER_BY_ID: Record<string, RarityTier> = Object.fromEntries(
  CARS.map((model) => [model.id, model.tier]),
)

/** Catalog SKU id -> its (carPartId, grade) identity, for v27 -> v28's
 * "find the sibling SKU at a different class" lookup. */
const PART_IDENTITY_BY_ID: Record<string, { carPartId: string; grade: string }> =
  Object.fromEntries(
    PARTS.map((part) => [part.id, { carPartId: part.carPartId, grade: part.grade }]),
  )

/** `${carPartId}|${grade}|${fitmentClass}` -> the one matching catalog SKU
 * id - v27 -> v28's remap target index. */
const PART_ID_BY_IDENTITY_AND_CLASS: Map<string, string> = new Map(
  PARTS.map((part) => [`${part.carPartId}|${part.grade}|${part.fitmentClass}`, part.id]),
)

/**
 * v27 -> v28 (Sprint 53): the sibling SKU at `targetClass`, same (carPartId,
 * grade) as `oldPartId` - a pre-v28 id is always `common`-class by
 * construction (the class system did not exist), so this is always a real
 * sideways relabel, never a price or condition change. Unknown ids (never
 * happens for real content) pass through untouched rather than crash.
 */
function remappedPartId(oldPartId: string, targetClass: PartFitmentClass): string {
  const identity = PART_IDENTITY_BY_ID[oldPartId]
  if (!identity) return oldPartId
  const key = `${identity.carPartId}|${identity.grade}|${targetClass}`
  return PART_ID_BY_IDENTITY_AND_CLASS.get(key) ?? oldPartId
}

/**
 * v27 -> v28: remaps every installed `PartInstance.partId` on one
 * `CarInstance` to its own model's fitment class - a pre-v28 owned/lot/
 * service-job car's parts are all implicitly `common`-class regardless of
 * its real tier, which would otherwise leave (for example) an already-owned
 * shitbox showing family-priced repair bills forever. Defensive against a
 * malformed/hand-edited save or an unresolvable model, same shape as every
 * other migration in this file.
 */
function migrateCarInstancePartsToClass(car: unknown): unknown {
  if (typeof car !== 'object' || car === null) return car
  const c = car as Record<string, unknown>
  const modelId = typeof c.modelId === 'string' ? c.modelId : undefined
  const tier = modelId ? MODEL_TIER_BY_ID[modelId] : undefined
  if (!tier || typeof c.parts !== 'object' || c.parts === null) return c
  const targetClass = fitmentClassForTier(tier)

  const oldParts = c.parts as Record<string, unknown>
  const parts: Record<string, unknown> = {}
  for (const [carPartId, slot] of Object.entries(oldParts)) {
    if (typeof slot !== 'object' || slot === null) {
      parts[carPartId] = slot
      continue
    }
    const s = slot as { installed?: unknown }
    const installed =
      typeof s.installed === 'object' && s.installed !== null
        ? (s.installed as Record<string, unknown>)
        : null
    const oldPartId = installed && typeof installed.partId === 'string' ? installed.partId : null
    parts[carPartId] = oldPartId
      ? { ...slot, installed: { ...installed, partId: remappedPartId(oldPartId, targetClass) } }
      : slot
  }
  return { ...c, parts }
}

/**
 * v27 -> v28: applies `migrateCarInstancePartsToClass` across every real
 * `CarInstance` population (mirrors v20 -> v21's own population list above),
 * plus customer-tagged loose `partInventory` parts whose service job is
 * still active (Sprint 35 decision 1's tag) - remapped to THAT job's car's
 * class, since that is the car the part will be reinstalled onto. An
 * untagged (ordinary player-owned) loose part, or one whose job has already
 * closed, is left alone - decision 6's "else common" default, which it
 * already is. `pendingPartOrders` are likewise left alone (no host car to
 * resolve a class from).
 */
function migrateV27ToV28(gameState: unknown): unknown {
  if (typeof gameState !== 'object' || gameState === null) return gameState
  const state = gameState as Record<string, unknown>

  const ownedCars = Array.isArray(state.ownedCars)
    ? state.ownedCars.map(migrateCarInstancePartsToClass)
    : state.ownedCars

  const activeAuctionLots = Array.isArray(state.activeAuctionLots)
    ? state.activeAuctionLots.map((lot) => {
        if (typeof lot !== 'object' || lot === null) return lot
        const l = lot as Record<string, unknown>
        return { ...l, car: migrateCarInstancePartsToClass(l.car) }
      })
    : state.activeAuctionLots

  const activeServiceJobs = Array.isArray(state.activeServiceJobs)
    ? state.activeServiceJobs.map((sj) => {
        if (typeof sj !== 'object' || sj === null) return sj
        const s = sj as Record<string, unknown>
        return { ...s, car: migrateCarInstancePartsToClass(s.car) }
      })
    : state.activeServiceJobs

  const serviceJobOffers = Array.isArray(state.serviceJobOffers)
    ? state.serviceJobOffers.map((sj) => {
        if (typeof sj !== 'object' || sj === null) return sj
        const s = sj as Record<string, unknown>
        return { ...s, car: migrateCarInstancePartsToClass(s.car) }
      })
    : state.serviceJobOffers

  const activeJobCarTierById = new Map<string, RarityTier>()
  if (Array.isArray(state.activeServiceJobs)) {
    for (const sj of state.activeServiceJobs) {
      if (typeof sj !== 'object' || sj === null) continue
      const s = sj as Record<string, unknown>
      const jobId = typeof s.id === 'string' ? s.id : undefined
      const jobCar =
        typeof s.car === 'object' && s.car !== null ? (s.car as Record<string, unknown>) : undefined
      const modelId = jobCar && typeof jobCar.modelId === 'string' ? jobCar.modelId : undefined
      const tier = modelId ? MODEL_TIER_BY_ID[modelId] : undefined
      if (jobId && tier) activeJobCarTierById.set(jobId, tier)
    }
  }
  const partInventory = Array.isArray(state.partInventory)
    ? state.partInventory.map((instance) => {
        if (typeof instance !== 'object' || instance === null) return instance
        const i = instance as Record<string, unknown>
        const jobId = typeof i.customerJobId === 'string' ? i.customerJobId : undefined
        const tier = jobId ? activeJobCarTierById.get(jobId) : undefined
        const oldPartId = typeof i.partId === 'string' ? i.partId : undefined
        if (!tier || !oldPartId) return instance
        return { ...i, partId: remappedPartId(oldPartId, fitmentClassForTier(tier)) }
      })
    : state.partInventory

  return {
    ...state,
    ownedCars,
    activeAuctionLots,
    activeServiceJobs,
    serviceJobOffers,
    partInventory,
  }
}

/**
 * Per-version upgrade steps: MIGRATIONS[v] turns a version-`v` gameState
 * into a version-`v+1` one. The Save law: a future version bump adds its
 * step here (a pure default-fill, like every version before v9, needs no
 * entry at all - schema defaults already handle that case in `decodeSave`).
 */
const MIGRATIONS: Record<number, (gameState: unknown) => unknown> = {
  8: migrateV8ToV9,
  11: migrateV11ToV12,
  13: migrateV13ToV14,
  15: migrateV15ToV16,
  17: migrateV17ToV18,
  19: migrateV19ToV20,
  20: migrateV20ToV21,
  22: migrateV22ToV23,
  27: migrateV27ToV28,
}

/** Runs the chain of migrations from an older save up to the current version. */
function migrate(gameState: unknown, fromVersion: number): unknown {
  let migrated = gameState
  for (let v = fromVersion; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (step) migrated = step(migrated)
  }
  return migrated
}

/** Serialize a GameState into a copy-paste save code. */
export function encodeSave(gameState: GameState): string {
  const envelope: SaveEnvelope = { version: SAVE_VERSION, gameState }
  return PREFIX + toBase64(JSON.stringify(envelope))
}

/**
 * Parse a save code back into a validated GameState. Throws a friendly
 * error on anything that isn't a readable save of this or an older version.
 */
export function decodeSave(code: string): GameState {
  const trimmed = code.trim()
  if (!trimmed.startsWith(PREFIX)) {
    throw new Error('That is not a Midnight Garage save code.')
  }
  let envelope: SaveEnvelope
  try {
    envelope = JSON.parse(fromBase64(trimmed.slice(PREFIX.length))) as SaveEnvelope
  } catch {
    throw new Error('This save code is corrupted and could not be read.')
  }
  if (typeof envelope.version !== 'number') {
    throw new Error('This save code is missing its version.')
  }
  if (envelope.version > SAVE_VERSION) {
    throw new Error('This save is from a newer version of the game and cannot be loaded.')
  }
  return GameStateSchema.parse(migrate(envelope.gameState, envelope.version))
}
