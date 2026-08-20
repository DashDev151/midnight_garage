import type { CashBucket, SessionEvent } from '@midnight-garage/content'
import type { Table } from 'dexie'

/**
 * Thin IndexedDB wrapper (via Dexie) for the single autosave slot. It
 * stores the opaque save *code* from saveCodec, not the raw state - the
 * codec owns versioning/validation, this owns bytes-on-disk. Every method
 * is a no-op when IndexedDB is unavailable (e.g. the happy-dom test env),
 * so store logic tests run without a fake IndexedDB dependency.
 *
 * Dexie is imported dynamically (`import('dexie')`
 * inside `getDb`) since it is the largest single
 * dependency reachable only from persistence, none of it needed for first
 * paint. Every export here is already async, so the split is internal: no
 * caller (or test) changes, they still `await` the same functions.
 */

interface SaveRow {
  slot: string
  code: string
}

/**
 * The session log (v0) - one row per player action, append-only.
 * `SessionEvent` (content/sessionEvent.ts) is the typed discriminated union
 * every event's `type`/`payload` pair validates against, so this table can
 * only ever hold an event the replay interpreter (`packages/sim/src/
 * careerReplay.ts`) also knows how to read back. `timestamp` is wall-clock
 * (game layer, not sim - never read by anything deterministic).
 */
export type { SessionEvent }

/**
 * The daily ledger stream - one row per cash movement, append-only,
 * beside `sessionEvents`. Each row is a day-log entry's money as
 * `cashMovementFor` (the single cash-classification law, content/cashLedger.ts)
 * classified it at the moment the entry was pushed: `bucket` is one of the five
 * cost-sheet lines, `amountYen` a magnitude (the bucket says which way the
 * money went), `entryType` the `DayLogEntry` type that carried it. `timestamp`
 * is wall-clock, exactly as `SessionEvent`'s.
 */
export interface LedgerEvent {
  id?: number
  day: number
  bucket: CashBucket
  amountYen: number
  entryType: string
  timestamp: number
}

/** A single key/value row - currently only the career identifier lives here. */
interface MetaRow {
  key: string
  value: string
}

/** The tables the wrapper drives, the surface the functions below use. */
interface SaveDb {
  saves: Table<SaveRow, string>
  sessionEvents: Table<SessionEvent, number>
  ledgerEvents: Table<LedgerEvent, number>
  meta: Table<MetaRow, string>
}

const SLOT = 'current'
const CAREER_ID_KEY = 'careerId'

let dbPromise: Promise<SaveDb | undefined> | undefined

/**
 * Lazily opens the database, dynamically importing Dexie on first use so it
 * lands in its own chunk. Returns undefined where IndexedDB is
 * absent (the test env), keeping every method a safe no-op there.
 */
function getDb(): Promise<SaveDb | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  if (!dbPromise) {
    dbPromise = import('dexie').then(({ default: Dexie }) => {
      class SaveDatabase extends Dexie {
        saves!: Table<SaveRow, string>
        sessionEvents!: Table<SessionEvent, number>
        ledgerEvents!: Table<LedgerEvent, number>
        meta!: Table<MetaRow, string>

        constructor() {
          super('midnight-garage')
          this.version(1).stores({ saves: 'slot' })
          // IndexedDB versioning, not GameState's SAVE_VERSION - no save
          // migration, no golden-save changes; these tables are independent of
          // save content.
          this.version(2).stores({ saves: 'slot', sessionEvents: '++id, day, type' })
          this.version(3).stores({
            saves: 'slot',
            sessionEvents: '++id, day, type',
            ledgerEvents: '++id, day, bucket',
            meta: 'key',
          })
          // Table shape is unchanged - this version bump rides alongside the
          // repair job engine's GameState-shape SAVE_VERSION bump
          // (saveCodec.ts), per the repair-refactor arc's save-law rule: every
          // state-shape change bumps both version numbers together.
          this.version(4).stores({
            saves: 'slot',
            sessionEvents: '++id, day, type',
            ledgerEvents: '++id, day, bucket',
            meta: 'key',
          })
          // Table shape is unchanged - rides alongside the classifieds-kill
          // GameState-shape SAVE_VERSION bump (saveCodec.ts), same rule as v4.
          this.version(5).stores({
            saves: 'slot',
            sessionEvents: '++id, day, type',
            ledgerEvents: '++id, day, bucket',
            meta: 'key',
          })
        }
      }
      return new SaveDatabase()
    })
  }
  return dbPromise
}

let persistRequested = false
function requestPersistence(): void {
  if (persistRequested) return
  persistRequested = true
  // R2: ask the browser not to evict our IndexedDB (honored on Chromium/FF).
  void navigator.storage?.persist?.()
}

export async function loadSave(): Promise<string | undefined> {
  const database = await getDb()
  if (!database) return undefined
  try {
    const row = await database.saves.get(SLOT)
    return row?.code
  } catch {
    return undefined
  }
}

export async function writeSave(code: string): Promise<void> {
  const database = await getDb()
  if (!database) return
  try {
    await database.saves.put({ slot: SLOT, code })
    requestPersistence()
  } catch {
    // Autosave is best-effort; a storage failure must never break gameplay.
  }
}

export async function clearSave(): Promise<void> {
  const database = await getDb()
  if (!database) return
  try {
    await database.saves.delete(SLOT)
  } catch {
    // ignore
  }
}

/** Fire-and-forget by design - callers never `await` this in a player-action
 * path (see `gameStore.ts`'s `logSessionEvent`); a lost telemetry event must
 * never break play, matching `writeSave`'s own best-effort shape. */
export async function appendSessionEvent(event: SessionEvent): Promise<void> {
  const database = await getDb()
  if (!database) return
  try {
    await database.sessionEvents.add(event)
  } catch {
    // Telemetry is best-effort; a storage failure must never break gameplay.
  }
}

export async function loadSessionEvents(): Promise<SessionEvent[]> {
  const database = await getDb()
  if (!database) return []
  try {
    return await database.sessionEvents.toArray()
  } catch {
    return []
  }
}

export async function clearSessionEvents(): Promise<void> {
  const database = await getDb()
  if (!database) return
  try {
    await database.sessionEvents.clear()
  } catch {
    // ignore
  }
}

/** Fire-and-forget, exactly as `appendSessionEvent`: a lost ledger row must
 * never break play. */
export async function appendLedgerEvent(event: LedgerEvent): Promise<void> {
  const database = await getDb()
  if (!database) return
  try {
    await database.ledgerEvents.add(event)
  } catch {
    // Telemetry is best-effort; a storage failure must never break gameplay.
  }
}

export async function loadLedgerEvents(): Promise<LedgerEvent[]> {
  const database = await getDb()
  if (!database) return []
  try {
    return await database.ledgerEvents.toArray()
  } catch {
    return []
  }
}

export async function clearLedgerEvents(): Promise<void> {
  const database = await getDb()
  if (!database) return
  try {
    await database.ledgerEvents.clear()
  } catch {
    // ignore
  }
}

/** A fresh career identifier - wall-clock plus a random tail, unique enough to
 * tell one export bundle's career from another. Game layer, never read by the
 * sim, so non-deterministic is fine (the `grantCounter` precedent). */
function newCareerId(): string {
  return `career-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Stamps a brand-new career identifier, replacing any existing one - called
 * (fire-and-forget) from `newGame()` so each career's export bundle carries its
 * own id. Returns the id it stamped, `undefined` where IndexedDB is absent. */
export async function stampNewCareerId(): Promise<string | undefined> {
  const database = await getDb()
  if (!database) return undefined
  try {
    const id = newCareerId()
    await database.meta.put({ key: CAREER_ID_KEY, value: id })
    return id
  } catch {
    return undefined
  }
}

/** The stored career identifier, stamping one first if none exists yet (a
 * career begun before the stamp existed) - the export bundle's own read. */
export async function ensureCareerId(): Promise<string | undefined> {
  const database = await getDb()
  if (!database) return undefined
  try {
    const row = await database.meta.get(CAREER_ID_KEY)
    if (row) return row.value
    return await stampNewCareerId()
  } catch {
    return undefined
  }
}
