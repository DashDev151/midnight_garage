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

const SLOT = 'current'

class SaveDatabase extends Dexie {
  saves!: Table<SaveRow, string>

  constructor() {
    super('midnight-garage')
    this.version(1).stores({ saves: 'slot' })
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
