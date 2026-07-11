import Dexie, { type Table } from 'dexie'

/**
 * Thin IndexedDB wrapper (via Dexie) for the single autosave slot. It
 * stores the opaque save *code* from saveCodec, not the raw state — the
 * codec owns versioning/validation, this owns bytes-on-disk. Every method
 * is a no-op when IndexedDB is unavailable (e.g. the happy-dom test env),
 * so store logic tests run without a fake IndexedDB dependency.
 */

interface SaveRow {
  slot: string
  code: string
}

/**
 * Sprint 24 (session log v0 — the record-real-play seed, maintainer idea
 * 2026-07-09): one row per player action, append-only. `payload` is a plain
 * object specific to `type` (e.g. `{ lotId, maxBidYen }` for a bid) — no
 * schema per event type here, since this is raw capture for a future
 * offline parsing pass, not a validated, replay-driving format. `timestamp`
 * is wall-clock (game layer, not sim — never read by anything
 * deterministic).
 */
export interface SessionEvent {
  id?: number
  day: number
  type: string
  payload: Record<string, unknown>
  timestamp: number
}

const SLOT = 'current'

class SaveDatabase extends Dexie {
  saves!: Table<SaveRow, string>
  sessionEvents!: Table<SessionEvent, number>

  constructor() {
    super('midnight-garage')
    this.version(1).stores({ saves: 'slot' })
    // IndexedDB versioning, not GameState's SAVE_VERSION — no save migration,
    // no golden-save changes; this table is independent of save content.
    this.version(2).stores({ saves: 'slot', sessionEvents: '++id, day, type' })
  }
}

let db: SaveDatabase | undefined
function getDb(): SaveDatabase | undefined {
  if (typeof indexedDB === 'undefined') return undefined
  if (!db) db = new SaveDatabase()
  return db
}

let persistRequested = false
function requestPersistence(): void {
  if (persistRequested) return
  persistRequested = true
  // R2: ask the browser not to evict our IndexedDB (honored on Chromium/FF).
  void navigator.storage?.persist?.()
}

export async function loadSave(): Promise<string | undefined> {
  const database = getDb()
  if (!database) return undefined
  try {
    const row = await database.saves.get(SLOT)
    return row?.code
  } catch {
    return undefined
  }
}

export async function writeSave(code: string): Promise<void> {
  const database = getDb()
  if (!database) return
  try {
    await database.saves.put({ slot: SLOT, code })
    requestPersistence()
  } catch {
    // Autosave is best-effort; a storage failure must never break gameplay.
  }
}

export async function clearSave(): Promise<void> {
  const database = getDb()
  if (!database) return
  try {
    await database.saves.delete(SLOT)
  } catch {
    // ignore
  }
}

/** Fire-and-forget by design — callers never `await` this in a player-action
 * path (see `gameStore.ts`'s `logSessionEvent`); a lost telemetry event must
 * never break play, matching `writeSave`'s own best-effort shape. */
export async function appendSessionEvent(event: SessionEvent): Promise<void> {
  const database = getDb()
  if (!database) return
  try {
    await database.sessionEvents.add(event)
  } catch {
    // Telemetry is best-effort; a storage failure must never break gameplay.
  }
}

export async function loadSessionEvents(): Promise<SessionEvent[]> {
  const database = getDb()
  if (!database) return []
  try {
    return await database.sessionEvents.toArray()
  } catch {
    return []
  }
}

export async function clearSessionEvents(): Promise<void> {
  const database = getDb()
  if (!database) return
  try {
    await database.sessionEvents.clear()
  } catch {
    // ignore
  }
}
