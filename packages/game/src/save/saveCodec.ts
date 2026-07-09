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
 */
export const SAVE_VERSION = 2

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
