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
 */
export const SAVE_VERSION = 5

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
 * Per-version upgrade steps: MIGRATIONS[v] turns a version-`v` gameState
 * into a version-`v+1` one. Empty today (v1 is the first save ever). The
 * Save law: a future version bump adds its step here.
 */
const MIGRATIONS: Record<number, (gameState: unknown) => unknown> = {}

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
