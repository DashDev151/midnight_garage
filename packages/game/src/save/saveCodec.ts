import { GameStateSchema, type GameState } from '@midnight-garage/content'

/**
 * Save schema version. The Save law (CLAUDE.md engineering law 4): every
 * change to the GameState shape bumps this, adds a `migrate` case if needed,
 * and updates the golden-save test in the same PR.
 *
 * - v1: first save (Sprint 07).
 * - v2 (Sprint 08): added `reputationPoints`, `serviceJobOffers`,
 *   `activeServiceJobs` to GameState. Purely additive with schema defaults, so
 *   a v1 save decodes under v2 with the new fields default-filled — no explicit
 *   `MIGRATIONS[1]` step is needed (the golden-save test pins that a v1 code
 *   still loads).
 * - v3 (Sprint 09): added `serviceBayCount`, `parkingBayCount`,
 *   `serviceBayCarIds` to GameState. Also purely additive with schema
 *   defaults (1 / 3 / [] — matching a fresh game's starting bays), so a v1 or
 *   v2 save decodes under v3 with no explicit `MIGRATIONS[2]` step needed.
 * - v4 (Sprint 11): added `laborSlotsSpentToday` to GameState (the live daily
 *   labor counter instant actions decrement, replacing the old client-only
 *   `pending`/commit-at-End-Day plan). Purely additive with a schema default
 *   of 0, so a pre-v4 save decodes under v4 with the field default-filled —
 *   correct, since that save's day genuinely hadn't spent any labor under a
 *   mechanic that didn't exist yet. A v4-or-later save always carries its
 *   real value, mid-day or not — no explicit `MIGRATIONS[3]` step needed.
 * - v5 (Sprint 12): `CarInstance`'s `condition`/`buildSheet` split collapsed
 *   into one unified `components` map (zones+slots -> components refactor).
 *   Deliberately **no `MIGRATIONS[4]` step** — the maintainer confirmed there
 *   are no existing saves worth preserving, so a pre-v5 save's `CarInstance`
 *   simply no longer matches the schema and `GameStateSchema.parse` below
 *   throws. That's intentional, not a gap: `hydrate()`/`importSaveCode()`
 *   (packages/game/src/stores/gameStore.ts) already catch a `decodeSave`
 *   failure and fall back to a fresh career, so nothing new needed building
 *   for it, only testing (saveCodec.test.ts confirms a pre-v5 code fails
 *   cleanly rather than crashing).
 * - v6 (Sprint 13): added `ownedEquipmentIds` to GameState (what REPAIR is
 *   gated on — the equipment/repair-vs-replace economy). Purely additive
 *   with a schema default of `[]`, so a pre-v6 save decodes under v6 with no
 *   equipment owned — correct, since equipment didn't exist as a concept
 *   yet. No explicit `MIGRATIONS[5]` step needed.
 * - v7 (Sprint 14): added `pendingPartOrders` and `cartPartIds` to GameState
 *   (standard-delivery orders in transit, and the persistent parts-market
 *   cart). Both purely additive with a schema default of `[]`, so a pre-v7
 *   save decodes under v7 with no orders in transit and an empty cart —
 *   correct, since neither concept existed yet. No explicit `MIGRATIONS[6]`
 *   step needed.
 * - v8 (Sprint 15): `PublicListing` (nested in `activeListings`) gained
 *   `reputationDeltaOnSale` — the quality/lemon reputation effect of a
 *   pending public-listing sale, captured at listing-creation time and
 *   applied when the listing resolves. Purely additive with a schema
 *   default of 0, so a pre-v8 save's already-pending listings resolve
 *   reputation-neutral — correct, since the rule didn't exist when they
 *   were created. No explicit `MIGRATIONS[7]` step needed.
 * - v9 (Sprint 17): `serviceBayCarIds` changed shape from a compact list of
 *   only-occupied car ids to a real, index-addressable array — one entry
 *   per physical bay, `null` for an empty one — the positional model
 *   drag-and-drop needs (dropping onto "service bay 3" now means bay 3, not
 *   wherever the array used to happen to render a car). A new sibling
 *   `parkingCarIds` field gets the same treatment; before v9 "parking" had
 *   no stored array at all — a car counted as parked purely by not
 *   appearing in `serviceBayCarIds`. **This is the first genuinely
 *   non-additive Save-law migration this codebase has needed** — every
 *   prior version bump was a brand-new field with a safe schema default,
 *   but a plain default-fill here would silently strand every real parked
 *   car: `parkingCarIds` defaulting to `[]` makes an old save's already-
 *   parked cars invisible to the new parking view even though they're
 *   still sitting in `ownedCars`/`activeServiceJobs`. `MIGRATIONS[8]`
 *   reconstructs both arrays instead: the old compact `serviceBayCarIds`
 *   packs into the first N service slots, and every shop car NOT in that
 *   old list (the same exclusion rule the pre-Sprint-17 `parkingView`
 *   itself used) packs into `parkingCarIds` — both padded with `null` up to
 *   their respective bay counts (or left un-padded/overflowing beyond count
 *   if a save's real occupancy somehow exceeds it, so a migration never
 *   silently drops a real car rather than erring on the side of keeping it
 *   visible).
 * - v10 (Sprint 18): added `stagedCarWork` — per-car repair/install work the
 *   player has staged but not yet confirmed (the parts-inventory + stage-
 *   then-confirm workflow). Purely additive with a schema default of `{}`,
 *   so a pre-v10 save decodes with nothing staged on any car — correct,
 *   since the concept didn't exist yet. No explicit `MIGRATIONS[9]` step
 *   needed (back to the normal additive case after v9's one-off migration).
 * - v11 (Sprint 19): `AuctionLot` (nested in `activeAuctionLots`) gained
 *   `playerMaxBidYen` and `rivalEscalatedBidsYen` — the multi-day bidding
 *   rework's live standings, replacing same-day instant bid resolution.
 *   Both purely additive with schema defaults (`null` / `[]`), so a pre-v11
 *   save's already-listed lots decode with no bid in progress and no
 *   escalation yet — correct, since a v10-or-earlier save could never have
 *   had a bid mid-flight (bidding always resolved the instant it was
 *   placed). No explicit `MIGRATIONS[10]` step needed.
 * - v12 (Sprint 20, auction rework II): `AuctionLot` swaps its whole bid-state
 *   shape — `playerMaxBidYen`/`rivalEscalatedBidsYen` (sealed player max +
 *   hidden per-rival escalation) replaced by `currentBidYen`/`leadingBidder`/
 *   `quietDays`/`playerHasBid` (open, visible bidding). Not a plain
 *   default-fill: a v11 lot with a real bid in flight would otherwise decode
 *   with `currentBidYen: 0` and lose its standing entirely. `MIGRATIONS[11]`
 *   (`migrateV11ToV12`) reconstructs the new shape instead: `currentBidYen =
 *   max(playerMaxBidYen ?? 0, ...rivalEscalatedBidsYen)`, `leadingBidder` is
 *   whichever side held that max (`'player'` on an exact tie — consistent
 *   with the new ties-go-to-player hammer rule; `null` if the max is 0, i.e.
 *   nobody had bid), `quietDays` resets to 0 (a fresh count under the new
 *   activity-based-closing rule), and `playerHasBid = playerMaxBidYen !==
 *   null`. The old fields are left in place on the migrated object rather
 *   than explicitly deleted — `GameStateSchema.parse` strips any key the
 *   schema no longer declares, the same as every other migration here.
 * - v13 (Sprint 21, value model): added `marketLedger` to GameState — the
 *   two supply/demand counters (`lotSupply`/`playerSales`) the reworked
 *   weekly market-heat update reads. Purely additive with a schema default
 *   of `{ lotSupply: {}, playerSales: {} }`, so a pre-v13 save decodes with
 *   both counters empty — correct, since the concept didn't exist yet and a
 *   fresh pair of empty counters behaves exactly like a brand-new career's.
 *   No explicit `MIGRATIONS[12]` step needed.
 */
export const SAVE_VERSION = 13

/** Stable format marker (NOT the schema version — that lives in the envelope). */
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
 * hand-edited save — every field it reads is guarded with a runtime type
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
 * `playerHasBid`) from the old sealed-max + per-rival-escalation shape — see
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
 * Per-version upgrade steps: MIGRATIONS[v] turns a version-`v` gameState
 * into a version-`v+1` one. The Save law: a future version bump adds its
 * step here (a pure default-fill, like every version before v9, needs no
 * entry at all — schema defaults already handle that case in `decodeSave`).
 */
const MIGRATIONS: Record<number, (gameState: unknown) => unknown> = {
  8: migrateV8ToV9,
  11: migrateV11ToV12,
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
