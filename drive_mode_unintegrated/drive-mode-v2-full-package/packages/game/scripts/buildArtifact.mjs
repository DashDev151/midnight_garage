/* Builds the standalone drive artifact: bundles the shell (which
 * imports the SAME modules the game screen uses) into one IIFE via
 * vite's JS API, then stitches it into the checked-in HTML template.
 * The artifact is a build OUTPUT now, never hand-edited. */
import { build } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const gameDir = join(here, '..')
const repoRoot = join(gameDir, '..', '..')
const outDir = join(gameDir, 'dist-artifact')

await build({
  configFile: false,
  root: gameDir,
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir,
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'es2020',
    lib: {
      entry: join(gameDir, 'src', 'screens', 'drive', 'standalone', 'shell.ts'),
      name: 'MidnightRoads',
      formats: ['iife'],
      fileName: () => 'shell.js',
    },
  },
})

const bundleName = readdirSync(outDir).find((f) => f.endsWith('.js'))
if (!bundleName) throw new Error('no bundle emitted')
const bundle = readFileSync(join(outDir, bundleName), 'utf8')
const template = readFileSync(join(repoRoot, 'tools', 'artifact', 'template.html'), 'utf8')
if (!template.includes('/*__BUNDLE__*/')) throw new Error('template placeholder missing')
const html = template.replace('/*__BUNDLE__*/', () => bundle)
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, 'midnight-roads.html')
writeFileSync(outFile, html)
console.log('artifact built:', outFile, (html.length / 1024).toFixed(0) + ' KiB')
