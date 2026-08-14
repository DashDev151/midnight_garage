import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SESSION_EVENT_TYPES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'

const SRC_DIR = __dirname
const SKIP_DIRS = new Set(['node_modules'])

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectTsFiles(fullPath, out)
    } else if (fullPath.endsWith('.ts') && !fullPath.endsWith('.test.ts')) {
      out.push(fullPath)
    }
  }
  return out
}

/**
 * The compiler already enforces the direction that matters
 * (`logSessionEvent` accepts only `SessionEventInput`, so a call site
 * logging a type the content union does not know is a compile error). This
 * test catches the reverse - a source-level regression net that keeps
 * working even if a future edit ever loosens `logSessionEvent`'s own
 * parameter type, or a call site is built through indirection the compiler
 * cannot see through (a spread, an `as` cast).
 *
 * Scans every `.ts` file under `packages/game/src` (not only `gameStore.ts`
 * itself), the whole game layer's own source text, for every
 * `logSessionEvent({ type: '...'` call site - `game.logSessionEvent(...)`
 * from a sibling store (`staffStore.ts`'s hire/dismiss/reassign actions)
 * matches the same pattern as a bare call from within `gameStore.ts`, since
 * this checks the literal text, not which module owns the call. A narrower
 * scan already missed exactly this once.
 */
describe('every logSessionEvent call site in the game package is in the SessionEvent vocabulary', () => {
  const callSiteTypes = collectTsFiles(SRC_DIR).flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf-8')
    return [...source.matchAll(/logSessionEvent\(\{\s*type:\s*'([a-zA-Z]+)'/g)].map(
      (match) => match[1] as string,
    )
  })

  it('finds a sane number of call sites (the regex itself did not silently break)', () => {
    // A generous floor below the real count rather than an exact pin, so
    // adding a new logged action does not itself fail this test; only a
    // regex or vocabulary regression does.
    expect(callSiteTypes.length).toBeGreaterThanOrEqual(40)
  })

  it.each(callSiteTypes)('logSessionEvent call site "%s" is a known SessionEvent type', (type) => {
    expect(SESSION_EVENT_TYPES).toContain(type)
  })
})

/**
 * The other direction of the same gap: a store action that mutates
 * `GameState` but never calls `logSessionEvent` at all replays as if it
 * never happened - a real recorded session diverges from its replay the
 * moment that action fires, silently. `hireMachineLine` was exactly this
 * (found and fixed alongside this test); the scan below catches the whole
 * class mechanically rather than one function at a time.
 *
 * Both store files put every top-level action at the same two-space
 * indent inside their `defineStore(() => { ... })` setup function, one
 * `function name(...)` per action, so a function's own body is bounded by
 * its declaration line and the next sibling declaration at the same
 * indent - simpler and more robust here than a real brace-matching parser,
 * and the same boundary the file's own authoring convention already
 * guarantees.
 */
describe('every gameState-mutating store action logs a session event', () => {
  const GAME_STORE_PATH = join(SRC_DIR, 'stores', 'gameStore.ts')
  const STAFF_STORE_PATH = join(SRC_DIR, 'stores', 'staffStore.ts')

  /** Actions that intentionally mutate `GameState` with no session event,
   * and why each is not a replay-fidelity gap. */
  const ALLOWLIST = new Set([
    // Cart staging only - no cash or inventory moves; `checkoutCart` logs
    // the real purchase once it happens.
    'addToCart',
    'removeFromCart',
    // Not reachable from any UI control (checkoutCart's own per-item
    // primitive is what the Buy flow calls); kept as a store action for
    // tests and dev use only, per its own doc comment.
    'buyPart',
    // A UI preference, not economic or replayable game state.
    'setFusePreset',
    'setAutoBidEnabled',
    // Career-boundary actions: each replaces the whole state rather than
    // advancing it mid-career, so none of them is a mid-script event a
    // career script would ever carry.
    'newGame',
    'hydrate',
    'importSaveCode',
    // Dev-console cheats: bypass price/reputation/gates on purpose, never
    // reachable during real play, so a real recorded session can never
    // contain one.
    'devGiveCash',
    'devRefillLabour',
    'devGrantCar',
    'devGrantPart',
    'devSetToolTier',
    'devSetToolShopOwned',
    'devGrantBay',
    'devSetReputationTier',
    'devSetSceneStanding',
  ])

  /** Every top-level action name paired with whether its body mutates
   * `stateExpr` (`gameState.value` or `game.gameState`) and whether it logs
   * a session event - sliced by declaration-line boundaries, per this
   * describe block's own doc comment. */
  function scanActions(
    filePath: string,
    stateExpr: string,
  ): { name: string; mutates: boolean; logs: boolean }[] {
    const lines = readFileSync(filePath, 'utf-8').split('\n')
    const declRegex = /^ {2}(?:async )?function ([A-Za-z0-9_]+)\(/
    const mutateRegex = new RegExp(`^\\s*${stateExpr.replace('.', '\\.')}\\s*=[^=]`, 'm')
    const decls = lines
      .map((line, index) => ({ index, match: declRegex.exec(line) }))
      .filter((entry): entry is { index: number; match: RegExpExecArray } => entry.match !== null)
    return decls.map(({ index, match }, i) => {
      const end = i + 1 < decls.length ? decls[i + 1]!.index : lines.length
      const body = lines.slice(index, end).join('\n')
      return {
        // The capture group always matches when declRegex itself matched.
        name: match[1]!,
        mutates: mutateRegex.test(body),
        logs: body.includes('logSessionEvent('),
      }
    })
  }

  const actions = [
    ...scanActions(GAME_STORE_PATH, 'gameState.value'),
    ...scanActions(STAFF_STORE_PATH, 'game.gameState'),
  ]

  it('finds a sane number of scanned actions (the slicer itself did not silently break)', () => {
    expect(actions.length).toBeGreaterThanOrEqual(100)
  })

  it('every allowlisted name is still a real action (no stale entries)', () => {
    const names = new Set(actions.map((a) => a.name))
    for (const allowed of ALLOWLIST) {
      expect(names, `"${allowed}" is allowlisted but no longer exists as a store action`).toContain(
        allowed,
      )
    }
  })

  const unlogged = actions.filter((a) => a.mutates && !a.logs && !ALLOWLIST.has(a.name))

  it('has no unlogged state-mutating action outside the allowlist', () => {
    expect(unlogged.map((a) => a.name)).toEqual([])
  })
})
