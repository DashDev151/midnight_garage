import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OVERWORLD_LOCATION_IDS } from '../pixi/overworld/buildings'
import { mapBackTarget } from '../screens/mapBack'
import { destinationFor } from '../screens/overworldNav'
import { router } from './index'

/**
 * Every route name the app navigates to exists in the router. A deleted
 * route with a survivor still pointing at it fails silently
 * at runtime (vue-router throws only when the navigation actually happens),
 * so this walks the source for every name-based navigation literal - router
 * pushes, `RouterLink` `:to` bindings, `mapBackTarget` fallbacks - and asks
 * the real router whether each name resolves. The two navigation tables that
 * build their targets in code (`overworldNav.ts`, `mapBack.ts`) are checked
 * through their own functions rather than by regex.
 */

const SRC_DIR = join(__dirname, '..')
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

const ROUTE_NAMES = new Set(router.getRoutes().map((route) => String(route.name)))

/** Every name-literal navigation shape the codebase uses. A new shape (say, a
 * helper that builds `{ name }` targets) belongs here or in its own
 * functional check below, not nowhere. */
const NAVIGATION_PATTERNS: readonly RegExp[] = [
  /\.(?:push|replace)\(\s*\{\s*name:\s*'([\w-]+)'/g,
  /:to="\{\s*name:\s*'([\w-]+)'/g,
  /mapBackTarget\([^)]*\{\s*name:\s*'([\w-]+)'/g,
]

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const filePath = join(dir, entry)
    if (statSync(filePath).isDirectory()) {
      files.push(...sourceFiles(filePath))
      continue
    }
    // Test files build their own throwaway routers with stub routes, so
    // their name literals are not claims about the real router.
    if (entry.endsWith('.test.ts')) continue
    if (entry.endsWith('.vue') || entry.endsWith('.ts')) files.push(filePath)
  }
  return files
}

function referencedNames(): { file: string; name: string }[] {
  const found: { file: string; name: string }[] = []
  for (const filePath of sourceFiles(SRC_DIR)) {
    const contents = readFileSync(filePath, 'utf8')
    for (const pattern of NAVIGATION_PATTERNS) {
      for (const match of contents.matchAll(pattern)) {
        found.push({ file: relative(REPO_ROOT, filePath), name: match[1]! })
      }
    }
  }
  return found
}

function nameOf(to: unknown): string | null {
  return typeof to === 'object' && to !== null && 'name' in to ? String(to.name) : null
}

describe('routing integrity', () => {
  it('finds navigation literals at all - a silent regex is a dead guard', () => {
    expect(referencedNames().length).toBeGreaterThan(0)
  })

  it('every name-based navigation literal in src names a route the router actually has', () => {
    const missing = referencedNames().filter(({ name }) => !ROUTE_NAMES.has(name))
    expect(
      missing,
      `navigation target(s) name no existing route:\n${missing
        .map(({ file, name }) => `${file}: '${name}'`)
        .join('\n')}`,
    ).toEqual([])
  })

  it('every overworld destination routes to an existing route', () => {
    for (const id of OVERWORLD_LOCATION_IDS) {
      const destination = destinationFor(id)
      if (destination.kind !== 'route') continue
      const name = nameOf(destination.to)
      expect(name, id).not.toBeNull()
      expect(ROUTE_NAMES.has(name!), `${id} -> '${name}'`).toBe(true)
    }
  })

  it('every mapBackTarget outcome routes to an existing route', () => {
    // The two outcomes the function has: the overworld flag, and the caller's
    // fallback (dead flags from deleted doors included).
    for (const fromQuery of ['overworld', 'workshop-floor', 'office', undefined]) {
      const name = nameOf(mapBackTarget(fromQuery, { name: 'garage' }))
      expect(name, String(fromQuery)).not.toBeNull()
      expect(ROUTE_NAMES.has(name!), `from=${String(fromQuery)} -> '${name}'`).toBe(true)
    }
  })
})
